import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import type {
  PlantSpeciesRow,
  SensorReadingRow,
  UserPlantRow,
} from '../common/database.types';
import { CreatePlantDto } from './dto/create-plant.dto';
import { UpdatePlantDto } from './dto/update-plant.dto';

export interface PlantView extends UserPlantRow {
  species: PlantSpeciesRow | null;
  latest_reading: SensorReadingRow | null;
}

@Injectable()
export class PlantsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(userId: string): Promise<PlantView[]> {
    const db = this.supabase.admin;
    const { data: plants, error } = await db
      .from('user_plants')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);

    return Promise.all((plants ?? []).map((plant) => this.hydrate(plant)));
  }

  async get(userId: string, plantId: string): Promise<PlantView> {
    const plant = await this.getOwnedPlant(userId, plantId);
    return this.hydrate(plant);
  }

  async create(userId: string, dto: CreatePlantDto): Promise<UserPlantRow> {
    const db = this.supabase.admin;
    if (dto.device_id) await this.assertOwnsDevice(userId, dto.device_id);

    const { data, error } = await db
      .from('user_plants')
      .insert({
        owner_user_id: userId,
        nickname: dto.nickname,
        device_id: dto.device_id ?? null,
        plant_species_id: dto.plant_species_id ?? null,
        notes: dto.notes ?? null,
      })
      .select()
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to create plant',
      );
    }
    return data;
  }

  async update(
    userId: string,
    plantId: string,
    dto: UpdatePlantDto,
  ): Promise<UserPlantRow> {
    const current = await this.getOwnedPlant(userId, plantId);
    if (dto.device_id) await this.assertOwnsDevice(userId, dto.device_id);

    const patch: Partial<UserPlantRow> = {};
    if (dto.nickname !== undefined) patch.nickname = dto.nickname;
    if (dto.device_id !== undefined) patch.device_id = dto.device_id;
    if (dto.plant_species_id !== undefined)
      patch.plant_species_id = dto.plant_species_id;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (Object.keys(patch).length === 0) return current;

    const { data, error } = await this.supabase.admin
      .from('user_plants')
      .update(patch)
      .eq('id', plantId)
      .eq('owner_user_id', userId)
      .select()
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to update plant',
      );
    }
    return data;
  }

  async remove(userId: string, plantId: string): Promise<{ ok: true }> {
    await this.getOwnedPlant(userId, plantId);
    const { error } = await this.supabase.admin
      .from('user_plants')
      .delete()
      .eq('id', plantId)
      .eq('owner_user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }

  private async getOwnedPlant(
    userId: string,
    plantId: string,
  ): Promise<UserPlantRow> {
    const { data, error } = await this.supabase.admin
      .from('user_plants')
      .select('*')
      .eq('id', plantId)
      .eq('owner_user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Plant not found');
    return data;
  }

  private async assertOwnsDevice(
    userId: string,
    deviceId: string,
  ): Promise<void> {
    const { data, error } = await this.supabase.admin
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .eq('owner_user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Device not found');
  }

  private async hydrate(plant: UserPlantRow): Promise<PlantView> {
    const db = this.supabase.admin;

    let species: PlantSpeciesRow | null = null;
    if (plant.plant_species_id) {
      const { data } = await db
        .from('plant_species')
        .select('*')
        .eq('id', plant.plant_species_id)
        .maybeSingle();
      species = data ?? null;
    }

    let latestReading: SensorReadingRow | null = null;
    if (plant.device_id) {
      // Defence in depth against a stale user_plants.device_id: unlink now
      // clears it, but rows written before that fix can still point at a pot
      // somebody else has since claimed. Reading by device_id alone would
      // show their sensor data on this plant's card.
      const { data: device } = await db
        .from('devices')
        .select('id')
        .eq('id', plant.device_id)
        .eq('owner_user_id', plant.owner_user_id)
        .maybeSingle();

      if (device) {
        const { data } = await db
          .from('sensor_readings')
          .select('*')
          .eq('device_id', plant.device_id)
          .order('ts', { ascending: false })
          .limit(1);
        latestReading = data?.[0] ?? null;
      }
    }

    return { ...plant, species, latest_reading: latestReading };
  }
}
