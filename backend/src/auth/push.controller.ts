import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtGuard } from '../common/jwt.guard';
import { RegisterPushDto } from './dto/register-push.dto';
import { PushService } from './push.service';

@Controller('push')
@UseGuards(JwtGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post('register')
  register(@CurrentUser() userId: string, @Body() dto: RegisterPushDto) {
    return this.push.register(userId, dto);
  }
}
