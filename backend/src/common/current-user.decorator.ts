import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt.guard';

/**
 * Resolves to the authenticated Supabase user id set by JwtGuard.
 * Only meaningful on routes guarded by JwtGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.userId as string;
  },
);
