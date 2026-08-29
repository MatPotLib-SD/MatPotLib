import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Thin wrapper exposing the Supabase admin (service role) client.
 * The service role key bypasses RLS, so EVERY user-facing query made through
 * this client must filter by the authenticated user id.
 */
@Injectable()
export class SupabaseService {
  private client: SupabaseClient<Database> | null = null;

  constructor(private readonly config: ConfigService) {}

  get admin(): SupabaseClient<Database> {
    if (!this.client) {
      this.client = createClient<Database>(
        this.config.getOrThrow<string>('SUPABASE_URL'),
        this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
    }
    return this.client;
  }
}
