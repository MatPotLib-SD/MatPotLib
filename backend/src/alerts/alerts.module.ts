import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { expoProvider } from './expo.provider';

@Module({
  controllers: [AlertsController],
  providers: [AlertsService, expoProvider],
  exports: [AlertsService],
})
export class AlertsModule {}
