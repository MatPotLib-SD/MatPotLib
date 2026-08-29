import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import type { PlantSpeciesRow } from '../common/database.types';
import { EnrichmentService } from '../enrichment/enrichment.service';

@Injectable()
export class SpeciesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly enrichment: EnrichmentService,
  ) {}

  /**
   * ilike search over common_name / scientific_name plus alias match.
   * Zero hits with a non-empty query trigger the LLM enrichment fallback
   * (no-op when OPENAI_API_KEY is unset).
   */
  async search(query?: string): Promise<PlantSpeciesRow[]> {
    const db = this.supabase.admin;
    const term = (query ?? '').trim();

    if (!term) {
      const { data, error } = await db
        .from('plant_species')
        .select('*')
        .order('common_name', { ascending: true })
        .limit(25);
      if (error) throw new InternalServerErrorException(error.message);
      return data ?? [];
    }

    // Strip characters that would break the PostgREST or() expression.
    const sanitized = term.replace(/[,%(){}"\\]/g, ' ').trim();
    if (!sanitized) return [];

    const { data, error } = await db
      .from('plant_species')
      .select('*')
      .or(
        `common_name.ilike.%${sanitized}%,` +
          `scientific_name.ilike.%${sanitized}%,` +
          `aliases.cs.{"${sanitized}"}`,
      )
      .limit(25);
    if (error) throw new InternalServerErrorException(error.message);
    if (data && data.length > 0) return data;

    const generated = await this.enrichment.generateSpecies(term);
    return generated ? [generated] : [];
  }
}
