import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import type { PushTokenRow } from '../common/database.types';
import { RegisterPushDto } from './dto/register-push.dto';

@Injectable()
export class PushService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Upserts an Expo push token keyed on (user_id, expo_token). */
  async register(userId: string, dto: RegisterPushDto): Promise<PushTokenRow> {
    const db = this.supabase.admin;
    const now = new Date().toISOString();

    const { data: existing, error: findError } = await db
      .from('push_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('expo_token', dto.expo_token)
      .maybeSingle();
    if (findError) throw new InternalServerErrorException(findError.message);

    if (existing) {
      const { data, error } = await db
        .from('push_tokens')
        .update({
          last_seen_at: now,
          platform: dto.platform ?? existing.platform,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error || !data) {
        throw new InternalServerErrorException(
          error?.message ?? 'Failed to update push token',
        );
      }
      return data;
    }

    const { data, error } = await db
      .from('push_tokens')
      .insert({
        user_id: userId,
        expo_token: dto.expo_token,
        platform: dto.platform ?? null,
        last_seen_at: now,
      })
      .select()
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to register push token',
      );
    }
    return data;
  }
}
