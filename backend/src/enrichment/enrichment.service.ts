import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../common/supabase.service';
import type { PlantSpeciesRow } from '../common/database.types';

interface OpenAIResponse {
  status?: string;
  output?: {
    type?: string;
    status?: string;
    content?: { type?: string; text?: string }[];
  }[];
}

const SYSTEM_PROMPT =
  'You are a horticulture data assistant. Search the web to verify the plant ' +
  'and its care ranges. Given a plant name, respond with ' +
  'a single JSON object with exactly these keys: input_is_plant_name ' +
  '(boolean: true only if the input text itself is the common or scientific ' +
  'name of a plant, allowing typos; false for objects, furniture, places, ' +
  'or anything else), common_name (string), ' +
  'scientific_name (string), care_level (one of "easy", "moderate", ' +
  '"hard"), ideal_moisture_min, ideal_moisture_max (soil moisture percent, ' +
  '0-100), ideal_temp_min, ideal_temp_max (degrees Celsius), ' +
  'ideal_humidity_min, ideal_humidity_max (relative humidity percent, ' +
  '0-100), ideal_lux_min, ideal_lux_max (light level in lux). All ideal_* ' +
  'values must be numbers. Use null for any value you do not know. The ' +
  'input must itself name a plant (common or scientific name; minor typos ' +
  'are fine). If it names anything else, set every value to null. Never ' +
  'substitute a plant that is merely associated with the input.';

const nullable = (type: 'string' | 'number') => ({ type: [type, 'null'] });

// Strict structured output. OpenAI rejects plain JSON mode (json_object)
// together with web search, which made every enrichment request fail with 400.
const SPECIES_FORMAT = {
  type: 'json_schema',
  name: 'plant_species',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'input_is_plant_name',
      'common_name',
      'scientific_name',
      'care_level',
      'ideal_moisture_min',
      'ideal_moisture_max',
      'ideal_temp_min',
      'ideal_temp_max',
      'ideal_humidity_min',
      'ideal_humidity_max',
      'ideal_lux_min',
      'ideal_lux_max',
    ],
    properties: {
      // Listed first so the model classifies the input before filling data;
      // instructions alone did not stop it mapping "office chair" to a plant.
      input_is_plant_name: { type: 'boolean' },
      common_name: nullable('string'),
      scientific_name: nullable('string'),
      care_level: {
        type: ['string', 'null'],
        enum: ['easy', 'moderate', 'hard', null],
      },
      ideal_moisture_min: nullable('number'),
      ideal_moisture_max: nullable('number'),
      ideal_temp_min: nullable('number'),
      ideal_temp_max: nullable('number'),
      ideal_humidity_min: nullable('number'),
      ideal_humidity_max: nullable('number'),
      ideal_lux_min: nullable('number'),
      ideal_lux_max: nullable('number'),
    },
  },
};

/**
 * Runtime LLM fallback (handoff §6): when a species search finds nothing,
 * generate one plant_species row via OpenAI and cache it with source='llm'.
 * Fails soft: any error (or a missing OPENAI_API_KEY) returns null.
 */
@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  async generateSpecies(query: string): Promise<PlantSpeciesRow | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.log(
        `OPENAI_API_KEY not set; skipping enrichment for "${query}"`,
      );
      return null;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          tools: [{ type: 'web_search' }],
          tool_choice: 'required',
          text: { format: SPECIES_FORMAT },
          input: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Plant: ${query}` },
          ],
        }),
      });
      if (!response.ok) {
        this.logger.warn(`OpenAI request failed with ${response.status}`);
        return null;
      }

      const body = (await response.json()) as OpenAIResponse;
      const output = body.output ?? [];
      if (
        body.status !== 'completed' ||
        !output.some(
          (item) =>
            item.type === 'web_search_call' && item.status === 'completed',
        )
      ) {
        this.logger.warn(`OpenAI web search did not complete for "${query}"`);
        return null;
      }
      const content = output
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? [])
        .find((item) => item.type === 'output_text')?.text;
      if (!content) return null;
      const parsed = JSON.parse(content) as Record<string, unknown>;

      const str = (v: unknown): string | null =>
        typeof v === 'string' && v.trim() ? v.trim() : null;
      const num = (v: unknown): number | null =>
        typeof v === 'number' && Number.isFinite(v) ? v : null;

      const commonName = str(parsed.common_name);
      if (parsed.input_is_plant_name !== true || !commonName) {
        this.logger.log(`Enrichment found no data for "${query}"`);
        return null;
      }

      // plant_species.scientific_name is NOT NULL UNIQUE, but the system
      // prompt tells the model to use null for anything it does not know — so
      // every such response failed the insert and the whole feature silently
      // returned "no matches". Fall back to the common name.
      const scientificName = str(parsed.scientific_name) ?? commonName;

      const { data, error } = await this.supabase.admin
        .from('plant_species')
        .insert({
          common_name: commonName,
          scientific_name: scientificName,
          aliases: [query],
          care_level: str(parsed.care_level),
          ideal_moisture_min: num(parsed.ideal_moisture_min),
          ideal_moisture_max: num(parsed.ideal_moisture_max),
          ideal_temp_min: num(parsed.ideal_temp_min),
          ideal_temp_max: num(parsed.ideal_temp_max),
          ideal_humidity_min: num(parsed.ideal_humidity_min),
          ideal_humidity_max: num(parsed.ideal_humidity_max),
          ideal_lux_min: num(parsed.ideal_lux_min),
          ideal_lux_max: num(parsed.ideal_lux_max),
          source: 'llm',
        })
        .select()
        .single();
      if (error || !data) {
        // 23505 = unique violation: a concurrent search (or that fallback
        // above colliding with an existing row) already stored this species.
        // Reuse it rather than reporting no result.
        if (error?.code === '23505') {
          const { data: existing } = await this.supabase.admin
            .from('plant_species')
            .select('*')
            .eq('scientific_name', scientificName)
            .maybeSingle();
          if (existing) return existing;
        }
        this.logger.warn(
          `Failed to persist enriched species: ${error?.message ?? 'no row'}`,
        );
        return null;
      }
      this.logger.log(`Enriched species "${commonName}" from query`);
      return data;
    } catch (err) {
      this.logger.warn(
        `Enrichment failed for "${query}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
