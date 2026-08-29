import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import type { SensorReadingRow } from '../common/database.types';
import { CreateReadingDto } from './dto/create-reading.dto';

@Injectable()
export class SensorsService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Inserts a reading and marks the device online (server stamps ts). */
  async insert(dto: CreateReadingDto): Promise<SensorReadingRow> {
    const db = this.supabase.admin;

    const { data, error } = await db
      .from('sensor_readings')
      .insert({
        device_id: dto.device_id,
        moisture: dto.moisture,
        temp_c: dto.temp_c,
        humidity: dto.humidity,
        lux: dto.lux,
        battery_pct: dto.battery_pct ?? null,
      })
      .select()
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to store reading',
      );
    }

    const { error: deviceError } = await db
      .from('devices')
      .update({ last_seen_at: new Date().toISOString(), status: 'online' })
      .eq('id', dto.device_id);
    if (deviceError) {
      throw new InternalServerErrorException(deviceError.message);
    }
    return data;
  }

  async latest(
    userId: string,
    deviceId: string,
  ): Promise<SensorReadingRow | null> {
    await this.assertOwnsDevice(userId, deviceId);
    const { data, error } = await this.supabase.admin
      .from('sensor_readings')
      .select('*')
      .eq('device_id', deviceId)
      .order('ts', { ascending: false })
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    return data?.[0] ?? null;
  }

  async history(
    userId: string,
    deviceId: string,
    from?: string,
    to?: string,
  ): Promise<SensorReadingRow[]> {
    await this.assertOwnsDevice(userId, deviceId);
    let query = this.supabase.admin
      .from('sensor_readings')
      .select('*')
      .eq('device_id', deviceId);
    if (from) query = query.gte('ts', from);
    if (to) query = query.lte('ts', to);
    const { data, error } = await query
      .order('ts', { ascending: true })
      .limit(5000);
    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
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
}
