import type { HealthStatus } from './theme';
import type { Reading, SpeciesRow } from '../types';

/** Format a timestamp as a short relative time, e.g. "12m ago". */
export function relativeTime(ts: string | null | undefined): string {
  if (!ts) return 'never';
  const diffMs = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(diffMs)) return 'unknown';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** True when a value is inside [min, max]; null bounds mean "unknown". */
export function inRange(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean | null {
  if (value == null || min == null || max == null) return null;
  return value >= min && value <= max;
}

/**
 * Derive an overall health indicator from the latest reading vs the
 * species' ideal ranges. Moisture out-of-range is treated as critical
 * (matches backend severity rules); other metrics degrade to "warn".
 */
export function deriveHealth(
  reading: Reading | null | undefined,
  species: SpeciesRow | null | undefined,
): HealthStatus {
  if (!reading || !species) return 'warn';
  let hasError = false;
  let hasWarn = false;
  const checks: {
    ok: boolean | null;
    critical: boolean;
  }[] = [
    {
      ok: inRange(reading.moisture, species.ideal_moisture_min, species.ideal_moisture_max),
      critical: true,
    },
    { ok: inRange(reading.temp_c, species.ideal_temp_min, species.ideal_temp_max), critical: false },
    {
      ok: inRange(reading.humidity, species.ideal_humidity_min, species.ideal_humidity_max),
      critical: false,
    },
    { ok: inRange(reading.lux, species.ideal_lux_min, species.ideal_lux_max), critical: false },
  ];
  for (const { ok, critical } of checks) {
    if (ok === false) {
      if (critical) hasError = true;
      else hasWarn = true;
    }
  }
  if (hasError) return 'error';
  if (hasWarn) return 'warn';
  return 'ok';
}

/** Compact number formatting for metric values (esp. lux). */
export function formatMetric(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—';
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(digits);
}
