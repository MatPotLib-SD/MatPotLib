import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listDevices, listPlants } from '../api/client';
import { Button, ScreenHeader, SectionTitle } from '../components/ui';
import { theme } from '../constants/theme';
import { useTablingActivity } from '../hooks/useTablingActivity';
import { useAuth } from '../hooks/useAuth';
import { challengeConditions, comparisonFeedback, condition, displayConditionValue, displayThreshold, readingAge, readingTime, setupIsReady, targetIdentity } from '../tabling/model';
import type { Device, Plant, Reading, SpeciesRow, TablingTabParamList } from '../types';

type Props = BottomTabScreenProps<TablingTabParamList, 'Activity'>;
const CONTACT_STALE_MS = 15_000;
const MEASUREMENT_STALE_MS = 60_000;

function clockTime(reading: Reading): string {
  const date = new Date(readingTime(reading));
  return Number.isNaN(date.getTime()) ? 'time unknown' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function Metric({ title, value, unit, min, max, digits }: {
  title: string; value: number | null | undefined; unit: string;
  min: number | null | undefined; max: number | null | undefined; digits: number;
}) {
  const status = condition(value, min, max);
  const knownRange = min != null && max != null && Number.isFinite(min) && Number.isFinite(max) && min <= max;
  return (
    <View style={styles.metric}>
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={styles.metricValue}>{displayConditionValue(value, min, max, digits)} <Text style={styles.unit}>{unit}</Text></Text>
      <Text style={[styles.status, status === 'In range' ? styles.ok : status === 'Unknown' ? styles.muted : styles.alert]}>{status}</Text>
      <Text style={styles.range}>{knownRange ? `Target ${displayThreshold(min, digits)}–${displayThreshold(max, digits)} ${unit}` : 'Target range unavailable'}</Text>
    </View>
  );
}

function Conditions({ reading, species }: { reading: Reading | null; species: SpeciesRow | null }) {
  return (
    <View style={styles.metricRow}>
      <Metric title="Soil sample moisture" value={reading?.moisture} unit="%" digits={1}
        min={species?.ideal_moisture_min} max={species?.ideal_moisture_max} />
      <Metric title="Light" value={reading?.lux} unit="lux" digits={1}
        min={species?.ideal_lux_min} max={species?.ideal_lux_max} />
    </View>
  );
}

function Snapshot({ title, reading, species, empty, note }: {
  title: string; reading: Reading | null; species: SpeciesRow | null; empty: string; note?: string;
}) {
  return (
    <View style={styles.snapshot}>
      <Text style={styles.snapshotTitle}>{title}</Text>
      {reading ? (
        <>
          <Text style={styles.caption}>Captured at {clockTime(reading)} · {reading.time_source === 'receipt' ? 'receipt time' : 'estimated sample time'}</Text>
          {note && <Text style={styles.notice}>{note}</Text>}
          <Conditions reading={reading} species={species} />
        </>
      ) : <Text style={styles.caption}>{empty}</Text>}
    </View>
  );
}

export function TablingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { profileError, refreshProfile } = useAuth();
  const [plants, setPlants] = useState<Plant[] | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showFacilitator, setShowFacilitator] = useState(true);
  const [tick, setTick] = useState(0);
  const setupLoadingRef = useRef(false);

  const selected = useMemo(() => plants?.find((p) => p.id === selectedId) ?? null, [plants, selectedId]);
  const deviceId = selected?.device_id ?? null;
  const device = devices.find((d) => d.id === deviceId) ?? null;
  const targetKey = targetIdentity(selected);
  const activity = useTablingActivity(deviceId, selectedId, targetKey);
  const species = selected?.species ?? null;
  const contextMatches = targetKey !== null && activity.activeTargetKey === targetKey;
  const current = contextMatches ? activity.current : null;
  const verifiedReading = contextMatches ? activity.verifiedReading : null;
  const before = contextMatches ? activity.before : null;
  const now = contextMatches ? activity.now : null;
  const inGroup = contextMatches && activity.phase === 'group';

  const loadSetup = useCallback(async () => {
    if (setupLoadingRef.current) return;
    setupLoadingRef.current = true;
    try {
      const [ownedPlants, ownedDevices] = await Promise.all([listPlants(), listDevices()]);
      setPlants(ownedPlants);
      setDevices(ownedDevices);
      setSelectedId((old) => old && ownedPlants.some((p) => p.id === old) ? old : null);
      setSetupError(null);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Could not load event setup.');
    } finally {
      setupLoadingRef.current = false;
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let setupTimer: ReturnType<typeof setInterval> | null = null;
    let timeTimer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (setupTimer) clearInterval(setupTimer);
      if (timeTimer) clearInterval(timeTimer);
      setupTimer = null;
      timeTimer = null;
    };
    const start = () => {
      if (setupTimer) return;
      void loadSetup();
      setTick(Date.now());
      setupTimer = setInterval(() => { void loadSetup(); }, 5000);
      timeTimer = setInterval(() => setTick(Date.now()), 1000);
    };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => state === 'active' ? start() : stop());
    return () => { stop(); subscription.remove(); };
  }, [loadSetup]));

  const commandAge = device?.last_command_contact_at ? tick - Date.parse(device.last_command_contact_at) : Infinity;
  const commandReady = !!device?.tabling_enabled && Number.isFinite(commandAge) && commandAge >= 0 && commandAge <= CONTACT_STALE_MS;
  const rangeReady = species?.ideal_moisture_min != null && species?.ideal_moisture_max != null
    && species?.ideal_lux_min != null && species?.ideal_lux_max != null
    && Number.isFinite(species.ideal_moisture_min) && Number.isFinite(species.ideal_moisture_max)
    && Number.isFinite(species.ideal_lux_min) && Number.isFinite(species.ideal_lux_max)
    && species.ideal_moisture_min <= species.ideal_moisture_max
    && species.ideal_lux_min <= species.ideal_lux_max;
  const setupReady = contextMatches && !!device && !!rangeReady && commandReady && !setupError && !profileError && !activity.recoveryError;
  const verified = setupIsReady(verifiedReading, species);
  const feedback = comparisonFeedback(now, species, activity.recheckState);
  const statuses = challengeConditions(verifiedReading, species);
  const currentTime = current ? Date.parse(readingTime(current)) : NaN;
  const currentStale = !Number.isFinite(currentTime) || tick - currentTime > MEASUREMENT_STALE_MS;
  const pending = contextMatches && (!!activity.request || activity.creating);

  let setupMessage: string | null = null;
  if (!selected) setupMessage = 'Select the event plant and device in Facilitator setup.';
  else if (!deviceId) setupMessage = 'This plant has no device. Assign one in Plants.';
  else if (!device) setupMessage = 'The linked device is not owned by this account. Check Settings.';
  else if (!device.tabling_enabled) setupMessage = 'This device is not enabled for tabling on the server. Ask the event administrator to enable it.';
  else if (!Number.isFinite(commandAge) || commandAge < 0 || commandAge > CONTACT_STALE_MS) setupMessage = 'No recent command contact. Check power, Wi-Fi, event firmware, and backend connection.';
  else if (!rangeReady) setupMessage = 'This species needs valid light and moisture target ranges before the activity can start.';
  else if (!contextMatches) setupMessage = 'Updating the activity for this plant and its target ranges…';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.sm }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([loadSetup(), activity.refreshCurrent()]);
        setRefreshing(false);
      }} />}>
      <ScreenHeader title="Plant conditions" />
      <Text style={styles.caption}>{selected ? `${selected.nickname || 'Event plant'} · ${species?.common_name || 'Species not selected'}` : 'Select an event plant below'}</Text>

      <View style={styles.card}>
        <SectionTitle>Current conditions</SectionTitle>
        <Text style={styles.caption}>{current ? `${readingAge(current, tick)} · ${clockTime(current)}${current.time_source === 'receipt' ? ' · receipt time' : ' · estimated sample time'}` : 'No measurement yet'}</Text>
        {current && currentStale && <Text style={styles.warning}>Measurement is stale. Check the device before using these values.</Text>}
        {activity.currentError && <Text style={styles.warning}>Latest reading unavailable: {activity.currentError}. Showing previous data.</Text>}
        {(pending || activity.captureError) && current && <Text style={styles.warning}>These are previous values; the new capture has not replaced them.</Text>}
        <Conditions reading={current} species={species} />
        {inGroup ? <Button title={before ? 'Check again' : 'Check plant now'}
          onPress={() => void activity.capture(before ? 'now' : 'before')}
          disabled={!setupReady || activity.recovering || pending} />
          : <Button title="Verify setup" onPress={() => void activity.capture('verify')}
            disabled={!setupReady || activity.recovering || pending} />}
      </View>

      {inGroup ? (
        <View style={styles.card}>
          <SectionTitle>Before → Now</SectionTitle>
          <Snapshot title="Before" reading={before} species={species} empty="Check plant now to capture the group's starting conditions." />
          <Snapshot title="Now" reading={now} species={species} empty="Make a change, then check again."
            note={now && activity.recheckState === 'pending' ? 'Previous recheck · new measurement pending'
              : now && activity.recheckState === 'failed' ? 'Previous recheck · latest attempt failed' : undefined} />
          {feedback === 'pending' ? <Text style={styles.notice}>{now
            ? 'A new recheck is in progress. The Now values above are from the previous recheck.'
            : 'A recheck is in progress. Now will appear when the sensor finishes.'}</Text>
            : feedback === 'failed' ? <Text style={styles.warning}>The latest recheck failed. Now shows the previous successful capture, if available.</Text>
              : feedback === 'success' ? <Text style={styles.success}>Both conditions are in range</Text>
                : before ? <Text style={styles.prompt}>What might change these conditions? Make a change, let the sample settle, then check again.</Text>
              : <Text style={styles.prompt}>What do you think needs to change?</Text>}
        </View>
      ) : (
        <View style={styles.card}>
          <SectionTitle>Prepare the next group</SectionTitle>
          <Text style={styles.prompt}>Staff: insert the probe into a fresh prepared dry soil sample beside the plant and reset the adjustable lamp.</Text>
          {verifiedReading && (
            <>
              <Text style={styles.caption}>Verified at {clockTime(verifiedReading)} · {verifiedReading.time_source === 'receipt' ? 'receipt time' : 'estimated sample time'}. Moisture: {statuses.moisture}. Light: {statuses.lux}.</Text>
              <Text style={verified ? styles.success : styles.warning}>{verified
                ? 'Both challenge conditions are valid and outside their target ranges.'
                : 'Setup is not ready: both light and soil sample moisture must be valid and outside their ranges. Adjust the physical setup and verify again.'}</Text>
              <Button title="Start group" onPress={activity.startGroup}
                disabled={!verified || pending || activity.recovering || !setupReady} />
            </>
          )}
        </View>
      )}

      {pending && <Text style={styles.notice}>{activity.creating ? 'Sending capture request…' : activity.request?.state === 'measuring' ? 'Measuring…' : 'Waiting for sensor…'} {activity.request ? `Request ${activity.request.id.slice(0, 8)}` : ''}</Text>}
      {activity.captureError && <Text style={styles.warning}>{activity.captureError}</Text>}
      {activity.recovering && <Text style={styles.notice}>Checking and clearing an earlier capture…</Text>}
      {activity.recoveryError && <View style={styles.card}>
        <Text style={styles.warning}>Capture recovery: {activity.recoveryError}</Text>
        <Button title="Retry recovery" variant="secondary" onPress={() => void activity.recover()} />
      </View>}
      {setupMessage && <Text style={styles.warning}>{setupMessage}</Text>}
      {setupError && <Text style={styles.warning}>Setup refresh failed: {setupError}. Check the connection and refresh.</Text>}
      {profileError && <View style={styles.card}>
        <Text style={styles.warning}>Staff profile is unavailable. Finish account setup before the activity.</Text>
        <Button title="Retry profile" variant="secondary" onPress={() => void refreshProfile()} />
      </View>}

      <View style={styles.card}>
        <Pressable onPress={() => setShowFacilitator((value) => !value)} accessibilityRole="button" style={styles.facilitatorToggle}>
          <Text style={styles.facilitatorTitle}>Facilitator setup {showFacilitator ? '▴' : '▾'}</Text>
        </Pressable>
        {showFacilitator && <>
          <Text style={styles.caption}>Select one owned plant linked to the event device. This selection and group progress reset when the app restarts.</Text>
          {plants === null && !setupError ? <Text style={styles.caption}>Loading plants…</Text> : null}
          {plants?.filter((p) => p.device_id).map((p) => (
            <Pressable key={p.id} onPress={() => setSelectedId(p.id)} accessibilityRole="button"
              style={[styles.option, selectedId === p.id && styles.selectedOption]}>
              <Text style={styles.optionText}>{p.nickname || p.species?.common_name || 'Unnamed plant'}{selectedId === p.id ? ' ✓' : ''}</Text>
              <Text style={styles.caption}>Device {p.device_id?.slice(0, 8)}</Text>
            </Pressable>
          ))}
          {plants && !plants.some((p) => p.device_id) && <Text style={styles.warning}>No linked plant found. Claim a device in Settings, then assign it to a plant in Plants.</Text>}
          <Button title="Open Plants" variant="secondary" onPress={() => navigation.navigate('Plants', { screen: 'PlantList' })} />
          <Button title="Open Settings" variant="secondary" onPress={() => navigation.navigate('Settings')} />
          <Button title="Next group / Reset activity" variant="danger" onPress={() => void activity.reset()} disabled={!deviceId || activity.recovering} />
          <Text style={styles.caption}>Activity hint for staff: children can adjust the lamp and add small measured amounts of water to the soil sample. Use the rehearsal's waiting interval before each recheck.</Text>
          <Text style={styles.caption}>Reset clears this group's comparison and cancels outstanding work. Staff must replace the soil sample, reset the lamp, and verify again. Historical readings remain saved.</Text>
        </>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl, gap: theme.spacing.md },
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.md, ...theme.shadow.card },
  caption: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, lineHeight: 20 },
  warning: { color: theme.colors.status.error, fontSize: theme.fontSize.sm, lineHeight: 20, fontWeight: '600' },
  notice: { color: theme.colors.status.info, fontSize: theme.fontSize.md, fontWeight: '600' },
  success: { color: theme.colors.status.ok, fontSize: theme.fontSize.md, fontWeight: '800' },
  prompt: { color: theme.colors.text, fontSize: theme.fontSize.md, lineHeight: 24 },
  metricRow: { flexDirection: 'row', gap: theme.spacing.sm },
  metric: { flex: 1, padding: theme.spacing.sm, backgroundColor: theme.colors.background, borderRadius: theme.radius.md, gap: theme.spacing.xs },
  metricTitle: { fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: '700' },
  metricValue: { color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: '800' },
  unit: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  status: { fontSize: theme.fontSize.sm, fontWeight: '800' },
  ok: { color: theme.colors.status.ok },
  muted: { color: theme.colors.textSecondary },
  alert: { color: theme.colors.status.error },
  range: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs },
  snapshot: { paddingVertical: theme.spacing.sm, borderTopWidth: 1, borderColor: theme.colors.border, gap: theme.spacing.sm },
  snapshotTitle: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: '800' },
  facilitatorToggle: { minHeight: theme.touchTarget, justifyContent: 'center' },
  facilitatorTitle: { fontSize: theme.fontSize.lg, color: theme.colors.text, fontWeight: '700' },
  option: { padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  selectedOption: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  optionText: { fontSize: theme.fontSize.md, color: theme.colors.text, fontWeight: '700' },
});
