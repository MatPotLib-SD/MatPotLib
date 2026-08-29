import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Verifies `Authorization: Bearer <supabase JWT>` against the Supabase JWKS
 * endpoint (SUPABASE_JWT_JWKS_URL) and attaches `userId` (the JWT `sub`
 * claim, i.e. auth.users.id) to the request.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(private readonly config: ConfigService) {}

  private getJwks(): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks) {
      const url = this.config.getOrThrow<string>('SUPABASE_JWT_JWKS_URL');
      this.jwks = createRemoteJWKSet(new URL(url));
    }
    return this.jwks;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const { payload } = await jwtVerify(token, this.getJwks());
      if (!payload.sub) {
        throw new Error('Token has no sub claim');
      }
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
