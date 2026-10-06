import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { cancelCapture, cancelPendingCapture, createCapture, getActiveCapture, getCapture, getLatestReading } from '../api/client';
import { newerReading } from '../tabling/model';
import { CaptureGate } from '../tabling/CaptureGate';
import type { CaptureRequest, Reading } from '../types';

type Phase = 'preparation' | 'group';
type Purpose = 'verify' | 'before' | 'now';
type RecheckState = 'idle' | 'pending' | 'failed' | 'completed';

const terminal = (state: CaptureRequest['state']) =>
  state === 'completed' || state === 'failed' || state === 'expired' || state === 'cancelled';
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
const isNotFound = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === 404;

export function useTablingActivity(deviceId: string | null, plantId: string | null, targetIdentity = plantId) {
  const targetKey = targetIdentity;
  const [phase, setPhase] = useState<Phase>('preparation');
  const [verifiedReading, setVerifiedReading] = useState<Reading | null>(null);
  const [before, setBefore] = useState<Reading | null>(null);
  const [now, setNow] = useState<Reading | null>(null);
  const [current, setCurrent] = useState<Reading | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(true);
  const [request, setRequest] = useState<CaptureRequest | null>(null);
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [creating, setCreating] = useState(false);
  const [recheckState, setRecheckState] = useState<RecheckState>('idle');
  const [activeTargetKey, setActiveTargetKey] = useState<string | null>(null);

  const generation = useRef(0);
  const gate = useRef(new CaptureGate());
  const requestRef = useRef<CaptureRequest | null>(null);
  const purposeRef = useRef<Purpose | null>(null);
  const activeKeyRef = useRef<{ deviceId: string; key: string; epoch: number } | null>(null);
  const previousKeyRef = useRef<{ deviceId: string; key: string } | null>(null);
  const previousCancellationRef = useRef<Promise<unknown | null> | null>(null);
  const busyRef = useRef(false);
  const latestPollingRef = useRef<{ epoch: number } | null>(null);
  const capturePollingRef = useRef<{ epoch: number } | null>(null);
  const focusRef = useRef(false);
  const foregroundRef = useRef(AppState.currentState === 'active');
  const beforeRef = useRef<Reading | null>(null);
  const phaseRef = useRef<Phase>('preparation');

  const clearRequest = useCallback(() => {
    requestRef.current = null;
    purposeRef.current = null;
    setRequest(null);
    setPurpose(null);
  }, []);

  const inspectAndCancel = useCallback(async (id: string) => {
    // Read-only inspection must precede a new capture. A prior app session's
    // request is never adopted as this group's measurement.
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const active = await getActiveCapture(id);
      if (!active || terminal(active.state)) return;
      const stopped = await cancelCapture(id, active.id);
      if (terminal(stopped.state)) {
        const remaining = await getActiveCapture(id);
        if (!remaining || terminal(remaining.state)) return;
      }
      await delay(1000);
    }
    throw new Error('A previous capture is still active. Wait for it to expire, then retry setup.');
  }, []);

  const recover = useCallback(async (id: string, epoch: number) => {
    setRecovering(true);
    setRecoveryError(null);
    try {
      // Cancellation by key records a terminal tombstone even if the original
      // create reaches the database after its HTTP response was lost.
      const previousCancellation = previousCancellationRef.current;
      if (previousCancellation) {
        const cancellationError = await previousCancellation;
        if (previousCancellationRef.current === previousCancellation) previousCancellationRef.current = null;
        const departedDevice = previousKeyRef.current != null && previousKeyRef.current.deviceId !== id;
        if (cancellationError && !(departedDevice && isNotFound(cancellationError))) {
          throw new Error(`Could not cancel the prior capture: ${errorMessage(cancellationError)}`);
        }
        previousKeyRef.current = null;
      } else if (previousKeyRef.current) {
        const previousKey = previousKeyRef.current;
        try {
          await cancelPendingCapture(previousKey.deviceId, previousKey.key);
        } catch (error) {
          // A departed device may no longer belong to this account. The
          // backend invalidates its commands when ownership is removed.
          if (previousKey.deviceId === id || !isNotFound(error)) throw error;
        }
        if (previousKeyRef.current === previousKey) previousKeyRef.current = null;
      }
      const activeKey = activeKeyRef.current;
      if (activeKey && activeKey.deviceId === id) {
        await cancelPendingCapture(id, activeKey.key);
        if (activeKeyRef.current === activeKey) activeKeyRef.current = null;
      }
      await inspectAndCancel(id);
      if (generation.current === epoch) setRecoveryError(null);
    } catch (error) {
      if (generation.current === epoch) setRecoveryError(errorMessage(error));
    } finally {
      if (generation.current === epoch) setRecovering(false);
    }
  }, [inspectAndCancel]);

  useEffect(() => {
    const activeGate = gate.current;
    const epoch = activeGate.selectDevice(deviceId);
    generation.current = epoch;
    phaseRef.current = 'preparation';
    beforeRef.current = null;
    busyRef.current = false;
    // The device identity changed; discard all local group state together.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    clearRequest();
    setPhase('preparation');
    setActiveTargetKey(targetKey);
    setVerifiedReading(null);
    setBefore(null);
    setNow(null);
    setCurrent(null);
    setCurrentError(null);
    setCaptureError(null);
    setCreating(false);
    setRecheckState('idle');
    if (deviceId) void recover(deviceId, epoch);
    else { setRecovering(false); setRecoveryError(null); }
    return () => {
      const obsolete = requestRef.current;
      const obsoleteKey = activeKeyRef.current;
      generation.current = activeGate.reset();
      if (deviceId && obsoleteKey?.deviceId === deviceId) {
        // The next setup awaits this cancellation before offering a button.
        previousKeyRef.current = { deviceId, key: obsoleteKey.key };
        previousCancellationRef.current = cancelPendingCapture(deviceId, obsoleteKey.key)
          .then(() => null, (error: unknown) => error);
        activeKeyRef.current = null;
      } else if (deviceId && obsolete) {
        void cancelCapture(deviceId, obsolete.id).catch(() => {
          // The next setup inspection will clear any server work if this
          // device remains selected. Expiry handles a departed device.
        });
      }
    };
  }, [deviceId, targetKey, clearRequest, recover]);

  const refreshCurrent = useCallback(async () => {
    const epoch = generation.current;
    if (!deviceId || latestPollingRef.current?.epoch === epoch || !focusRef.current || !foregroundRef.current) return;
    const token = { epoch };
    latestPollingRef.current = token;
    try {
      const reading = await getLatestReading(deviceId);
      if (generation.current !== epoch || latestPollingRef.current !== token || !focusRef.current || !foregroundRef.current) return;
      if (reading) setCurrent((old) => newerReading(reading, old) ? reading : old);
      setCurrentError(null);
    } catch (error) {
      if (generation.current === epoch && latestPollingRef.current === token && focusRef.current && foregroundRef.current) setCurrentError(errorMessage(error));
    } finally {
      if (latestPollingRef.current === token) latestPollingRef.current = null;
    }
  }, [deviceId]);

  const pollCapture = useCallback(async () => {
    const pending = requestRef.current;
    const epoch = generation.current;
    if (!deviceId || !pending || capturePollingRef.current?.epoch === epoch || !focusRef.current || !foregroundRef.current) return;
    const token = { epoch };
    capturePollingRef.current = token;
    const expectedPurpose = purposeRef.current;
    try {
      const result = await getCapture(deviceId, pending.id);
      if (!focusRef.current || !foregroundRef.current || capturePollingRef.current !== token || !gate.current.accepts(deviceId, epoch, pending.id) || requestRef.current?.id !== pending.id || purposeRef.current !== expectedPurpose) return;
      setRequest(result);
      requestRef.current = result;
      if (!terminal(result.state)) return;
      clearRequest();
      gate.current.finish(deviceId, epoch, pending.id);
      if (activeKeyRef.current?.epoch === epoch && activeKeyRef.current.deviceId === deviceId) activeKeyRef.current = null;
      busyRef.current = false;
      if (result.state === 'completed' && result.reading && result.reading.capture_request_id === pending.id) {
        const reading = result.reading;
        setCurrent((old) => newerReading(reading, old) ? reading : old);
        if (expectedPurpose === 'verify') setVerifiedReading(reading);
        if (expectedPurpose === 'before' && !beforeRef.current) {
          beforeRef.current = reading;
          setBefore(reading);
        }
        if (expectedPurpose === 'now' && beforeRef.current) setNow(reading);
        if (expectedPurpose === 'now') setRecheckState('completed');
        setCaptureError(null);
      } else {
        if (expectedPurpose === 'now') setRecheckState('failed');
        setCaptureError(result.state === 'completed'
          ? 'The capture returned no matching sensor reading. Please retry.'
          : result.failure_reason || `Capture ${result.state}. Please retry.`);
      }
    } catch (error) {
      if (generation.current === epoch && capturePollingRef.current === token) setCaptureError(`Cannot check the capture yet: ${errorMessage(error)} The request may still be running.`);
    } finally {
      if (capturePollingRef.current === token) capturePollingRef.current = null;
    }
  }, [deviceId, clearRequest]);

  useFocusEffect(useCallback(() => {
    focusRef.current = true;
    let currentTimer: ReturnType<typeof setInterval> | null = null;
    let requestTimer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (currentTimer) clearInterval(currentTimer);
      if (requestTimer) clearInterval(requestTimer);
      currentTimer = null;
      requestTimer = null;
      latestPollingRef.current = null;
      capturePollingRef.current = null;
    };
    const start = () => {
      if (currentTimer) return;
      void refreshCurrent();
      void pollCapture();
      currentTimer = setInterval(() => { void refreshCurrent(); }, 5000);
      requestTimer = setInterval(() => { void pollCapture(); }, 1000);
    };
    foregroundRef.current = AppState.currentState === 'active';
    if (foregroundRef.current) start();
    const subscription = AppState.addEventListener('change', (state) => {
      foregroundRef.current = state === 'active';
      if (foregroundRef.current) start(); else stop();
    });
    return () => {
      focusRef.current = false;
      stop();
      subscription.remove();
    };
  }, [refreshCurrent, pollCapture]));

  const capture = useCallback(async (requestedPurpose: Purpose) => {
    if (!deviceId || recovering || recoveryError || busyRef.current || requestRef.current) return;
    if (requestedPurpose === 'verify' && phaseRef.current !== 'preparation') return;
    if (requestedPurpose !== 'verify' && phaseRef.current !== 'group') return;
    busyRef.current = true;
    setCreating(true);
    setCaptureError(null);
    if (requestedPurpose === 'verify') setVerifiedReading(null);
    if (requestedPurpose === 'now') setRecheckState('pending');
    const epoch = generation.current;
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeKeyRef.current = { deviceId, key, epoch };
    const creating = (async () => {
      try {
        return await createCapture(deviceId, key);
      } catch (error) {
        // A lost POST response can leave server work active. Retry the same
        // operation/key once; the backend returns its original request.
        if (typeof error !== 'object' || error === null || !('status' in error) || error.status !== 0) throw error;
        return createCapture(deviceId, key);
      }
    })();
    try {
      const created = await creating;
      if (generation.current !== epoch) {
        try { await cancelCapture(deviceId, created.id); } catch { /* reset recovery will inspect */ }
        return;
      }
      if (!gate.current.associate(deviceId, epoch, created.id)) {
        try { await cancelCapture(deviceId, created.id); } catch { /* reset recovery will inspect */ }
        return;
      }
      requestRef.current = created;
      purposeRef.current = requestedPurpose;
      setRequest(created);
      setCreating(false);
      setPurpose(requestedPurpose);
      void pollCapture();
    } catch (error) {
      if (generation.current === epoch) {
        if (requestedPurpose === 'now') setRecheckState('failed');
        setCaptureError(`Could not start capture: ${errorMessage(error)} Check for an active request before retrying.`);
        // A timed-out POST may have created work. Block new requests until it
        // has been inspected and cancelled rather than silently adopting it.
        void recover(deviceId, epoch);
      }
    } finally {
      if (generation.current === epoch) setCreating(false);
      if (generation.current === epoch && !requestRef.current) busyRef.current = false;
    }
  }, [deviceId, recovering, recoveryError, pollCapture, recover]);

  const startGroup = useCallback(() => {
    if (recovering || recoveryError || busyRef.current || requestRef.current || !verifiedReading) return;
    phaseRef.current = 'group';
    beforeRef.current = null;
    setPhase('group');
    setBefore(null);
    setNow(null);
    setRecheckState('idle');
    setCaptureError(null);
  }, [recovering, recoveryError, verifiedReading]);

  const reset = useCallback(async () => {
    if (!deviceId) return;
    const epoch = gate.current.reset();
    generation.current = epoch;
    phaseRef.current = 'preparation';
    beforeRef.current = null;
    clearRequest();
    setPhase('preparation');
    setVerifiedReading(null);
    setBefore(null);
    setNow(null);
    setRecheckState('idle');
    setCaptureError(null);
    setCreating(false);
    await recover(deviceId, epoch);
    busyRef.current = false;
  }, [deviceId, clearRequest, recover]);

  return {
    phase, verifiedReading, before, now, current, currentError, captureError, creating, recheckState,
    activeTargetKey,
    recoveryError, recovering, request, purpose, capture, startGroup, reset, recover: () => deviceId ? recover(deviceId, generation.current) : undefined,
    refreshCurrent,
  };
}
