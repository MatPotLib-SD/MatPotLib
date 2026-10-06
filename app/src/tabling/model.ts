import type { Plant, Reading, SpeciesRow } from '../types';

export type Condition = 'Too low' | 'In range' | 'Too high' | 'Unknown';

export function condition(value: number | null | undefined, min: number | null | undefined, max: number | null | undefined): Condition {
  if (value == null || !Number.isFinite(value) || min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max) || min > max) return 'Unknown';
  if (value < min) return 'Too low';
  if (value > max) return 'Too high';
  return 'In range';
}

export function challengeConditions(reading: Reading | null, species: SpeciesRow | null) {
  return {
    moisture: condition(reading?.moisture, species?.ideal_moisture_min, species?.ideal_moisture_max),
    lux: condition(reading?.lux, species?.ideal_lux_min, species?.ideal_lux_max),
  };
}

export function setupIsReady(reading: Reading | null, species: SpeciesRow | null): boolean {
  const c = challengeConditions(reading, species);
  return (c.moisture === 'Too low' || c.moisture === 'Too high') && (c.lux === 'Too low' || c.lux === 'Too high');
}

export function recheckSucceeded(reading: Reading | null, species: SpeciesRow | null): boolean {
  const c = challengeConditions(reading, species);
  return c.moisture === 'In range' && c.lux === 'In range';
}

export function comparisonFeedback(
  now: Reading | null,
  species: SpeciesRow | null,
  recheckState: 'idle' | 'pending' | 'failed' | 'completed',
): 'pending' | 'failed' | 'success' | 'investigate' {
  if (recheckState === 'pending') return 'pending';
  if (recheckState === 'failed') return 'failed';
  if (recheckState === 'completed' && recheckSucceeded(now, species)) return 'success';
  return 'investigate';
}

export function readingTime(reading: Reading): string {
  return reading.captured_at || reading.ts;
}

/** Effective acquisition time, then server reading ID, is the backend's ordering. */
export function newerReading(candidate: Reading, current: Reading | null): boolean {
  if (!current) return true;
  const candidateTime = Date.parse(readingTime(candidate));
  const currentTime = Date.parse(readingTime(current));
  if (!Number.isFinite(candidateTime)) return false;
  if (!Number.isFinite(currentTime)) return true;
  return candidateTime > currentTime || (candidateTime === currentTime && candidate.id > current.id);
}

/** Soil sensor is stored to 0.1%; lux is shown in full units. */
export function displayValue(value: number | null | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/** Preserve boundary direction when stored data has more decimals than usual. */
export function displayConditionValue(value: number | null | undefined, min: number | null | undefined, max: number | null | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const actual = condition(value, min, max);
  for (let precision = digits; precision <= 8; precision += 1) {
    if (condition(Number(value.toFixed(precision)), min, max) === actual) return value.toFixed(precision);
  }
  return value.toString();
}

export function displayThreshold(value: number | null | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(digits));
  return rounded === value ? value.toFixed(digits) : value.toString();
}

export function readingAge(reading: Reading | null, now = Date.now()): string {
  if (!reading) return 'No measurement yet';
  const age = Math.max(0, now - Date.parse(readingTime(reading)));
  if (!Number.isFinite(age)) return 'Measurement time unknown';
  if (age < 60_000) return `${Math.floor(age / 1000)} seconds old`;
  return `${Math.floor(age / 60_000)} minutes old`;
}

/** A change in species or challenge targets starts a new local activity. */
export function targetIdentity(plant: Plant | null): string | null {
  if (!plant) return null;
  const species = plant.species;
  return JSON.stringify([
    plant.id, plant.device_id, plant.plant_species_id, species?.id,
    species?.ideal_moisture_min, species?.ideal_moisture_max,
    species?.ideal_lux_min, species?.ideal_lux_max,
  ]);
}
