import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { SensorsController } from './sensors.controller';
import { SensorsService } from './sensors.service';

@Module({
  imports: [AlertsModule],
  controllers: [SensorsController],
  providers: [SensorsService],
})
export class SensorsModule {}
