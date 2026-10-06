import {
  Injectable,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import type { SensorReadingRow } from '../common/database.types';
import { CreateReadingDto } from './dto/create-reading.dto';

@Injectable()
export class SensorsService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Database function commits reading and request result in one transaction. */
  async insert(dto: CreateReadingDto): Promise<{
    reading: SensorReadingRow;
    inserted: boolean;
    suppress_alerts: boolean;
  }> {
    const db = this.supabase.admin;
    const { data, error } = await db.rpc('tabling_ingest_reading', {
      p_device_id: dto.device_id,
      p_moisture: dto.moisture,
      p_temp_c: dto.temp_c,
      p_humidity: dto.humidity,
      p_lux: dto.lux,
      p_battery_pct: dto.battery_pct ?? null,
      p_sample_age_ms: dto.sample_age_ms ?? null,
      p_capture_request_id: dto.capture_request_id ?? null,
    });
    if (
      error &&
      /capture_not_active|sample_predates_capture/.test(error.message)
    ) {
      throw new ConflictException(
        'Capture is no longer active or sample predates request',
      );
    }
    if (error && /sample_age_required/.test(error.message)) {
      throw new BadRequestException('Commanded captures require sample_age_ms');
    }
    if (error && /capture_not_found/.test(error.message)) {
      throw new NotFoundException('Capture not found for this device');
    }
    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to store reading',
      );
    }

    return data as {
      reading: SensorReadingRow;
      inserted: boolean;
      suppress_alerts: boolean;
    };
  }

  async latest(
    userId: string,
    deviceId: string,
  ): Promise<SensorReadingRow | null> {
    const { data, error } = await this.supabase.admin.rpc(
      'tabling_owned_latest',
      {
        p_device_id: deviceId,
        p_user_id: userId,
      },
    );
    if (error && /device_not_found/.test(error.message))
      throw new NotFoundException('Device not found');
    if (error) throw new InternalServerErrorException(error.message);
    return data as SensorReadingRow | null;
  }

  async history(
    userId: string,
    deviceId: string,
    from?: string,
    to?: string,
  ): Promise<SensorReadingRow[]> {
    const { data, error } = await this.supabase.admin.rpc(
      'tabling_owned_history',
      {
        p_device_id: deviceId,
        p_user_id: userId,
        p_from: from ?? null,
        p_to: to ?? null,
      },
    );
    if (error && /device_not_found/.test(error.message))
      throw new NotFoundException('Device not found');
    if (error) throw new InternalServerErrorException(error.message);
    return (data as SensorReadingRow[]) ?? [];
  }
}
