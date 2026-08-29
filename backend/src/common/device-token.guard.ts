import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { SupabaseService } from './supabase.service';

/**
 * Device ingest auth (handoff §8.2): reads the `x-device-token` header and
 * `device_id` from the body, sha256-hashes the token and matches it against
 * `device_secrets.secret_hash` for that device. 401 otherwise.
 */
@Injectable()
export class DeviceTokenGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-device-token'];
    const body = request.body as { device_id?: unknown } | undefined;
    const deviceId = body?.device_id;

    if (typeof token !== 'string' || !token || typeof deviceId !== 'string') {
      throw new UnauthorizedException('Missing device credentials');
    }

    const secretHash = createHash('sha256').update(token).digest('hex');
    const { data, error } = await this.supabase.admin
      .from('device_secrets')
      .select('*')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error || !data || data.secret_hash !== secretHash) {
      throw new UnauthorizedException('Invalid device token');
    }
    return true;
  }
}
