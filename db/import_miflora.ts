/**
 * import_miflora.ts — one-time seed of `plant_species` from MiFloraDB.
 *
 * Source: PlantDB_5335_U0.csv from https://github.com/khronimo/MiFloraDB
 * (GPL-3.0 — see seed_notes.md for attribution).
 *
 * Usage:
 *   cd db
 *   npm install
 *   cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   npm run import
 *
 * Behavior:
 *   1. Parses db/PlantDB_5335_U0.csv (RFC4180 via csv-parse; handles quoted commas).
 *   2. Maps columns to plant_species (see HANDOFF.md Section 6). Empty,
 *      non-numeric, and zero numeric cells are stored as NULL (MiFloraDB uses
 *      0 as a "missing" marker).
 *   3. Upserts in batches of 500 with conflict target scientific_name.
 *   4. If OPENAI_API_KEY is set: enrichment pass fills ONLY missing ideal_*
 *      cells via OpenAI (JSON output) and logs a random sample of ~20 filled
 *      rows for manual verification. Without a key it just logs the count of
 *      incomplete rows and exits.
 */

import { createReadStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import 'dotenv/config';

const __dirname_ = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname_, 'PlantDB_5335_U0.csv');
const UPSERT_BATCH_SIZE = 500;
const ENRICH_CONCURRENCY = 5;
const ENRICH_SAMPLE_SIZE = 20;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SpeciesRow {
  scientific_name: string;
  common_name: string | null;
  aliases: string[] | null;
  ideal_moisture_min: number | null;
  ideal_moisture_max: number | null;
  ideal_lux_min: number | null;
  ideal_lux_max: number | null;
  ideal_temp_min: number | null;
  ideal_temp_max: number | null;
  ideal_humidity_min: number | null;
  ideal_humidity_max: number | null;
  source: string;
}

const IDEAL_COLUMNS = [
  'ideal_moisture_min',
  'ideal_moisture_max',
  'ideal_lux_min',
  'ideal_lux_max',
  'ideal_temp_min',
  'ideal_temp_max',
  'ideal_humidity_min',
  'ideal_humidity_max',
] as const;

type IdealColumn = (typeof IDEAL_COLUMNS)[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Empty, non-numeric, and zero cells become null.
 * MiFloraDB uses 0 to mean "no data" for these range columns.
 */
function toNum(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return null;
  return n;
}

function toText(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** `alias` cell may contain several names separated by commas. */
function toAliases(raw: string | undefined): string[] | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : null;
}

function missingIdealColumns(row: Pick<SpeciesRow, IdealColumn>): IdealColumn[] {
  return IDEAL_COLUMNS.filter((c) => row[c] === null || row[c] === undefined);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── CSV parsing ─────────────────────────────────────────────────────────────

async function parseCsv(): Promise<SpeciesRow[]> {
  const rows = new Map<string, SpeciesRow>(); // dedupe by scientific_name
  let headerLogged = false;
  let rawCount = 0;

  const parser = createReadStream(CSV_PATH).pipe(
    parse({
      columns: (header: string[]) => {
        console.log(`Detected CSV headers (${header.length}):`);
        console.log(`  ${header.join(', ')}`);
        headerLogged = true;
        return header;
      },
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false, // we trim per-field so quoted fields keep internal spacing
    }),
  );

  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    rawCount++;
    const scientificName = toText(record.pid);
    if (!scientificName) {
      console.warn(`  Skipping row ${rawCount}: empty pid`);
      continue;
    }
    rows.set(scientificName, {
      scientific_name: scientificName,
      common_name: toText(record.display_pid),
      aliases: toAliases(record.alias),
      ideal_moisture_min: toNum(record.min_soil_moist),
      ideal_moisture_max: toNum(record.max_soil_moist),
      ideal_lux_min: toNum(record.min_light_lux),
      ideal_lux_max: toNum(record.max_light_lux),
      ideal_temp_min: toNum(record.min_temp),
      ideal_temp_max: toNum(record.max_temp),
      ideal_humidity_min: toNum(record.min_env_humid),
      ideal_humidity_max: toNum(record.max_env_humid),
      source: 'MiFloraDB',
    });
  }

  if (!headerLogged) throw new Error('CSV appears to be empty (no header row)');
  console.log(`Parsed ${rawCount} CSV rows -> ${rows.size} unique species (deduped by pid).`);
  return [...rows.values()];
}

// ─── Upsert ──────────────────────────────────────────────────────────────────

async function upsertAll(supabase: SupabaseClient, rows: SpeciesRow[]): Promise<void> {
  const batches = chunk(rows, UPSERT_BATCH_SIZE);
  let done = 0;
  for (const [i, batch] of batches.entries()) {
    const { error } = await supabase
      .from('plant_species')
      .upsert(batch, { onConflict: 'scientific_name' });
    if (error) {
      throw new Error(`Upsert batch ${i + 1}/${batches.length} failed: ${error.message}`);
    }
    done += batch.length;
    console.log(`  Upserted batch ${i + 1}/${batches.length} (${done}/${rows.length} rows)`);
  }
}

// ─── Enrichment ──────────────────────────────────────────────────────────────

interface EnrichedValues {
  ideal_moisture_min?: number | null;
  ideal_moisture_max?: number | null;
  ideal_lux_min?: number | null;
  ideal_lux_max?: number | null;
  ideal_temp_min?: number | null;
  ideal_temp_max?: number | null;
  ideal_humidity_min?: number | null;
  ideal_humidity_max?: number | null;
}

const COLUMN_DESCRIPTIONS: Record<IdealColumn, string> = {
  ideal_moisture_min: 'minimum ideal soil moisture, percent (0-100)',
  ideal_moisture_max: 'maximum ideal soil moisture, percent (0-100)',
  ideal_lux_min: 'minimum ideal light level, lux',
  ideal_lux_max: 'maximum ideal light level, lux',
  ideal_temp_min: 'minimum ideal air temperature, degrees Celsius',
  ideal_temp_max: 'maximum ideal air temperature, degrees Celsius',
  ideal_humidity_min: 'minimum ideal relative air humidity, percent (0-100)',
  ideal_humidity_max: 'maximum ideal relative air humidity, percent (0-100)',
};

/** Sanity bounds so a bad LLM answer cannot poison the table. */
const COLUMN_BOUNDS: Record<IdealColumn, [number, number]> = {
  ideal_moisture_min: [0, 100],
  ideal_moisture_max: [0, 100],
  ideal_lux_min: [0, 200000],
  ideal_lux_max: [0, 200000],
  ideal_temp_min: [-40, 60],
  ideal_temp_max: [-40, 60],
  ideal_humidity_min: [0, 100],
  ideal_humidity_max: [0, 100],
};

async function enrichRow(
  openai: OpenAI,
  row: SpeciesRow,
  missing: IdealColumn[],
): Promise<Partial<Record<IdealColumn, number>> | null> {
  const fieldList = missing.map((c) => `- "${c}": ${COLUMN_DESCRIPTIONS[c]}`).join('\n');
  const known = IDEAL_COLUMNS.filter((c) => row[c] !== null)
    .map((c) => `${c}=${row[c]}`)
    .join(', ');

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You are a horticulture reference. Given a plant species, provide typical ideal ' +
          'growing-condition ranges for indoor/potted care. Respond ONLY with a JSON object ' +
          'containing exactly the requested keys with numeric values. If you genuinely cannot ' +
          'estimate a value, use null for that key.',
      },
      {
        role: 'user',
        content:
          `Species: ${row.scientific_name}` +
          (row.common_name ? ` (common name: ${row.common_name})` : '') +
          (known ? `\nAlready known values: ${known}` : '') +
          `\nProvide these missing values:\n${fieldList}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;

  let parsed: EnrichedValues;
  try {
    parsed = JSON.parse(content) as EnrichedValues;
  } catch {
    console.warn(`  [enrich] ${row.scientific_name}: non-JSON response, skipping`);
    return null;
  }

  const updates: Partial<Record<IdealColumn, number>> = {};
  for (const col of missing) {
    const v = parsed[col];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const [lo, hi] = COLUMN_BOUNDS[col];
    if (v < lo || v > hi) {
      console.warn(`  [enrich] ${row.scientific_name}: ${col}=${v} out of bounds, discarded`);
      continue;
    }
    updates[col] = v;
  }
  return Object.keys(updates).length > 0 ? updates : null;
}

async function enrichmentPass(supabase: SupabaseClient): Promise<void> {
  // Re-read incomplete rows from the DB (authoritative post-upsert state).
  // Page through, since 5k+ rows can exceed the default PostgREST limit.
  const incomplete: SpeciesRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('plant_species')
      .select(
        'scientific_name, common_name, ideal_moisture_min, ideal_moisture_max, ' +
          'ideal_lux_min, ideal_lux_max, ideal_temp_min, ideal_temp_max, ' +
          'ideal_humidity_min, ideal_humidity_max',
      )
      .or(IDEAL_COLUMNS.map((c) => `${c}.is.null`).join(','))
      .order('scientific_name')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to query incomplete rows: ${error.message}`);
    if (!data || data.length === 0) break;
    incomplete.push(...(data as unknown as SpeciesRow[]));
    if (data.length < PAGE) break;
  }

  console.log(`Rows missing at least one ideal_* value: ${incomplete.length}`);

  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not set — skipping enrichment pass.');
    console.log(`(${incomplete.length} incomplete rows left as-is; re-run with a key to fill.)`);
    return;
  }
  if (incomplete.length === 0) {
    console.log('Nothing to enrich.');
    return;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let filled = 0;
  let failed = 0;
  const filledSamples: { scientific_name: string; updates: Record<string, number> }[] = [];

  // Process with limited concurrency; per-row failures never abort the run.
  const queue = [...incomplete];
  async function worker(): Promise<void> {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      const missing = missingIdealColumns(row);
      if (missing.length === 0) continue;
      try {
        const updates = await enrichRow(openai, row, missing);
        if (!updates) {
          failed++;
          continue;
        }
        const { error } = await supabase
          .from('plant_species')
          .update(updates)
          .eq('scientific_name', row.scientific_name);
        if (error) {
          console.warn(`  [enrich] ${row.scientific_name}: write-back failed: ${error.message}`);
          failed++;
          continue;
        }
        filled++;
        // Reservoir sample of ~ENRICH_SAMPLE_SIZE filled rows for manual review.
        if (filledSamples.length < ENRICH_SAMPLE_SIZE) {
          filledSamples.push({ scientific_name: row.scientific_name, updates: updates as Record<string, number> });
        } else if (Math.random() < ENRICH_SAMPLE_SIZE / filled) {
          filledSamples[Math.floor(Math.random() * ENRICH_SAMPLE_SIZE)] = {
            scientific_name: row.scientific_name,
            updates: updates as Record<string, number>,
          };
        }
        if (filled % 100 === 0) {
          console.log(`  [enrich] progress: ${filled} filled, ${failed} failed/skipped`);
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  [enrich] ${row.scientific_name}: OpenAI call failed: ${msg}`);
      }
    }
  }
  await Promise.all(Array.from({ length: ENRICH_CONCURRENCY }, () => worker()));

  console.log(`Enrichment done: ${filled} rows filled, ${failed} rows failed or unfillable.`);
  console.log(`Random sample of ${filledSamples.length} filled rows — VERIFY MANUALLY:`);
  for (const s of filledSamples) {
    console.log(`  ${s.scientific_name}: ${JSON.stringify(s.updates)}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Reading ${CSV_PATH} ...`);
  const rows = await parseCsv();

  const incompleteBefore = rows.filter((r) => missingIdealColumns(r).length > 0).length;
  console.log(`Rows with at least one missing ideal_* value in the CSV: ${incompleteBefore}`);

  console.log(`Upserting ${rows.length} rows in batches of ${UPSERT_BATCH_SIZE} ...`);
  await upsertAll(supabase, rows);
  console.log('Upsert complete.');

  await enrichmentPass(supabase);
  console.log('Import finished.');
}

main().catch((err) => {
  console.error('Import failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
