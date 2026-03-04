import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import type { AuthenticatedUser } from './auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller()
export class AuthController {
  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return {
      data: {
        user_id: user.id,
        email: user.email ?? null,
      },
    };
  }
}
