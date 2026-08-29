/**
 * Tiny typed fetch wrapper for the NestJS backend (HANDOFF Section 8.4).
 * Every request carries `Authorization: Bearer <supabase access token>`.
 */
import { supabase } from './supabase';
import type {
  Alert,
  Device,
  Plant,
  PlantInput,
  Profile,
  ProfileUpdate,
  Reading,
  SpeciesRow,
} from '../types';

const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

/**
 * Azure Container Apps cold-starts the backend in ~25s (see README), so this
 * has to sit comfortably above that. It exists to stop a hung request from
 * leaving a refresh spinner running forever, not to enforce a latency budget.
 */
const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the request never got a response. */
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request timed out or never reached the server. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError('The server took too long to respond.', 0);
    }
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
      error?: string;
    } | null;
    if (body?.message) {
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } else if (body?.error) {
      message = body.error;
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

/** GET /sensors/:deviceId — latest reading, or null when the pot has never
 *  reported (ownership checked server-side). */
export function getLatestReading(deviceId: string): Promise<Reading | null> {
  return request<Reading | null>(`/sensors/${deviceId}`).then((r) => r ?? null);
}

/** GET /sensors/:deviceId/history?from&to — readings for chart ranges. */
export function getReadingHistory(deviceId: string, from: Date, to: Date): Promise<Reading[]> {
  const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  return request<Reading[]>(`/sensors/${deviceId}/history?${qs}`);
}

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

/** GET /plants — list plants incl. latest reading. */
export function listPlants(): Promise<Plant[]> {
  return request<Plant[]>('/plants');
}

/** POST /plants — add a plant. */
export function createPlant(input: PlantInput): Promise<Plant> {
  return request<Plant>('/plants', { method: 'POST', body: JSON.stringify(input) });
}

/** GET /plants/:id — plant detail. */
export function getPlant(id: string): Promise<Plant> {
  return request<Plant>(`/plants/${id}`);
}

/** PUT /plants/:id — edit a plant. */
export function updatePlant(id: string, input: Partial<PlantInput>): Promise<Plant> {
  return request<Plant>(`/plants/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

/** DELETE /plants/:id — remove a plant. */
export function deletePlant(id: string): Promise<void> {
  return request<void>(`/plants/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

/** GET /species?q= — search; backend triggers LLM fallback when no match. */
export function searchSpecies(q: string): Promise<SpeciesRow[]> {
  return request<SpeciesRow[]>(`/species?q=${encodeURIComponent(q)}`);
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** POST /devices/claim — claim a pot by its printed claim code. */
export function claimDevice(claimCode: string): Promise<Device> {
  return request<Device>('/devices/claim', {
    method: 'POST',
    body: JSON.stringify({ claim_code: claimCode }),
  });
}

/** GET /devices — list devices owned by the current user. */
export function listDevices(): Promise<Device[]> {
  return request<Device[]>('/devices');
}

/** DELETE /devices/:id — unlink a device. */
export function deleteDevice(id: string): Promise<void> {
  return request<void>(`/devices/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/** GET /alerts — alert history for the current user. */
export function listAlerts(): Promise<Alert[]> {
  return request<Alert[]>('/alerts');
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/** POST /push/register — store the Expo push token for this user/device. */
export function registerPushToken(expoToken: string, platform: string): Promise<void> {
  return request<void>('/push/register', {
    method: 'POST',
    body: JSON.stringify({ expo_token: expoToken, platform }),
  });
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** GET /profiles/me — current user's profile (bootstrapped server-side). */
export function getMyProfile(): Promise<Profile> {
  return request<Profile>('/profiles/me');
}

/** PUT /profiles/me — update onboarding answers / display name. */
export function updateMyProfile(update: ProfileUpdate): Promise<Profile> {
  return request<Profile>('/profiles/me', { method: 'PUT', body: JSON.stringify(update) });
}
