import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { CapturesController } from './captures.controller';
import { CapturesService } from './captures.service';

@Module({
  controllers: [DevicesController, CapturesController],
  providers: [DevicesService, CapturesService],
  exports: [DevicesService],
})
export class DevicesModule {}
