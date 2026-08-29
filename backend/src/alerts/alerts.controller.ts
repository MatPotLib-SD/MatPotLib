import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtGuard } from '../common/jwt.guard';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(JwtGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.alerts.list(userId);
  }
}
