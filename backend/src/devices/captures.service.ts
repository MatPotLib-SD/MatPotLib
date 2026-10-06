import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  CaptureRequestRow,
  SensorReadingRow,
} from '../common/database.types';
import { SupabaseService } from '../common/supabase.service';

export type CaptureView = CaptureRequestRow & {
  reading: SensorReadingRow | null;
};

@Injectable()
export class CapturesService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(
    userId: string,
    deviceId: string,
    key: string,
  ): Promise<CaptureView> {
    const { data, error } = await this.supabase.admin.rpc(
      'tabling_create_capture',
      {
        p_device_id: deviceId,
        p_user_id: userId,
        p_key: key,
      },
    );
    this.check(error);
    const result = data as {
      capture?: CaptureRequestRow;
      active_capture_id?: string;
    };
    if (result.active_capture_id) {
      throw new ConflictException({
        message: 'Another capture is active',
        active_capture_id: result.active_capture_id,
      });
    }
    return this.hydrate(result.capture!);
  }

  async active(userId: string, deviceId: string): Promise<CaptureView | null> {
    const { data, error } = await this.supabase.admin.rpc(
      'tabling_active_capture',
      {
        p_device_id: deviceId,
        p_user_id: userId,
      },
    );
    this.check(error);
    return data ? this.hydrate(data as CaptureRequestRow) : null;
  }

  async cancelPending(
    userId: string,
    deviceId: string,
    key: string,
  ): Promise<CaptureView> {
    const { data, error } = await this.supabase.admin.rpc(
      'tabling_cancel_pending_capture',
      {
        p_device_id: deviceId,
        p_user_id: userId,
        p_key: key,
      },
    );
    this.check(error);
    return this.hydrate(data as CaptureRequestRow);
  }

  async get(
    userId: string,
    deviceId: string,
    captureId: string,
  ): Promise<CaptureView> {
    const { data, error } = await this.supabase.admin.rpc(
      'tabling_get_capture',
      {
        p_device_id: deviceId,
        p_user_id: userId,
        p_capture_id: captureId,
      },
    );
    this.check(error);
    return this.hydrate(data as CaptureRequestRow);
  }

  async cancel(
    userId: string,
    deviceId: string,
    captureId: string,
  ): Promise<CaptureView> {
    const { data, error } = await this.supabase.admin.rpc(
      'tabling_cancel_capture',
      {
        p_device_id: deviceId,
        p_user_id: userId,
        p_capture_id: captureId,
      },
    );
    this.check(error);
    return this.hydrate(data as CaptureRequestRow);
  }

  async poll(deviceId: string): Promise<{
    capture_request_id: string | null;
    expires_at: string | null;
    remaining_ms: number | null;
  }> {
    const { data, error } = await this.supabase.admin.rpc(
      'tabling_poll_capture',
      {
        p_device_id: deviceId,
      },
    );
    this.check(error);
    return data as {
      capture_request_id: string | null;
      expires_at: string | null;
      remaining_ms: number | null;
    };
  }

  async fail(
    deviceId: string,
    captureId: string,
    reason: string,
  ): Promise<{ ok: true }> {
    const { error } = await this.supabase.admin.rpc('tabling_fail_capture', {
      p_device_id: deviceId,
      p_capture_id: captureId,
      p_reason: reason,
    });
    this.check(error);
    return { ok: true };
  }

  private async hydrate(capture: CaptureRequestRow): Promise<CaptureView> {
    if (!capture.result_reading_id) return { ...capture, reading: null };
    const { data, error } = await this.supabase.admin
      .from('sensor_readings')
      .select('*')
      .eq('id', capture.result_reading_id)
      .single();
    this.check(error);
    return { ...capture, reading: data };
  }

  private check(error: { message: string } | null): void {
    if (!error) return;
    if (/device_not_found|capture_not_found/.test(error.message)) {
      throw new NotFoundException('Capture or device not found');
    }
    if (/tabling_disabled/.test(error.message)) {
      throw new ConflictException('Capture is disabled for this device');
    }
    throw new InternalServerErrorException(error.message);
  }
}
