import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import type { DeviceRow } from '../common/database.types';

/**
 * A pot reports every 15 minutes, so three missed reports means something is
 * wrong. `devices.status` is only ever written as 'online' at ingest time and
 * nothing reverts it, so derive the live value from last_seen_at instead of
 * trusting the stored column.
 */
const DEVICE_STALE_MS = 45 * 60 * 1000;

function withDerivedStatus(row: DeviceRow): DeviceRow {
  const lastSeen = row.last_seen_at ? Date.parse(row.last_seen_at) : NaN;
  const online =
    Number.isFinite(lastSeen) && Date.now() - lastSeen < DEVICE_STALE_MS;
  return { ...row, status: online ? 'online' : 'offline' };
}

@Injectable()
export class DevicesService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Claims an unclaimed device by claim_code. 409 when the code is invalid,
   * the device is already claimed, or the caller already owns a device
   * (one device per user for MVP).
   */
  async claim(userId: string, claimCode: string): Promise<DeviceRow> {
    const db = this.supabase.admin;

    const { data: device, error } = await db
      .from('devices')
      .select('*')
      .eq('claim_code', claimCode)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!device) throw new ConflictException('Invalid claim code');
    if (device.owner_user_id) {
      throw new ConflictException('Device is already claimed');
    }

    const { data: owned, error: ownedError } = await db
      .from('devices')
      .select('*')
      .eq('owner_user_id', userId)
      .limit(1);
    if (ownedError) throw new InternalServerErrorException(ownedError.message);
    if (owned && owned.length > 0) {
      throw new ConflictException('You already own a device');
    }

    // .is('owner_user_id', null) guards the race where someone else claims
    // between the check above and this update.
    const { data: claimed, error: claimError } = await db
      .from('devices')
      .update({ owner_user_id: userId })
      .eq('id', device.id)
      .is('owner_user_id', null)
      .select()
      .maybeSingle();
    if (claimError) {
      throw new InternalServerErrorException(claimError.message);
    }
    if (!claimed) {
      throw new ConflictException('Device is already claimed');
    }
    return withDerivedStatus(claimed);
  }

  async list(userId: string): Promise<DeviceRow[]> {
    const { data, error } = await this.supabase.admin
      .from('devices')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []).map(withDerivedStatus);
  }

  /** Unlinks (sets owner to null) a device owned by the caller. */
  async unlink(userId: string, deviceId: string): Promise<{ ok: true }> {
    const db = this.supabase.admin;
    const { data: device, error } = await db
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!device || device.owner_user_id !== userId) {
      throw new NotFoundException('Device not found');
    }

    // Detach the device from this user's plants FIRST. user_plants.device_id
    // is not cleared by the FK (nothing is deleted here, only unowned), and a
    // stale pointer keeps resolving after someone else claims the pot — which
    // surfaces the new owner's readings on this user's plant card and can
    // route their alerts to the wrong phone.
    const { error: detachError } = await db
      .from('user_plants')
      .update({ device_id: null })
      .eq('device_id', deviceId)
      .eq('owner_user_id', userId);
    if (detachError) {
      throw new InternalServerErrorException(detachError.message);
    }

    const { error: updateError } = await db
      .from('devices')
      .update({ owner_user_id: null })
      .eq('id', deviceId)
      .eq('owner_user_id', userId);
    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }
    return { ok: true };
  }
}
