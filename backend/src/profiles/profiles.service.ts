import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import type { ProfileRow } from '../common/database.types';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Returns the caller's profile, bootstrapping an empty row if missing. */
  async getOrCreate(userId: string): Promise<ProfileRow> {
    const db = this.supabase.admin;
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (data) return data;

    const { data: created, error: insertError } = await db
      .from('profiles')
      .insert({ user_id: userId })
      .select()
      .single();
    if (insertError || !created) {
      throw new InternalServerErrorException(
        insertError?.message ?? 'Failed to bootstrap profile',
      );
    }
    return created;
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<ProfileRow> {
    const current = await this.getOrCreate(userId);
    const patch: Partial<ProfileRow> = {};
    if (dto.display_name !== undefined) patch.display_name = dto.display_name;
    if (dto.experience_level !== undefined)
      patch.experience_level = dto.experience_level;
    if (dto.goals !== undefined) patch.goals = dto.goals;
    if (dto.plant_types !== undefined) patch.plant_types = dto.plant_types;
    if (Object.keys(patch).length === 0) return current;

    const { data, error } = await this.supabase.admin
      .from('profiles')
      .update(patch)
      .eq('user_id', userId)
      .select()
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to update profile',
      );
    }
    return data;
  }
}
