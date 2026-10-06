import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { DeviceTokenGuard } from '../common/device-token.guard';
import { JwtGuard } from '../common/jwt.guard';
import { AlertsService } from '../alerts/alerts.service';
import { CreateReadingDto } from './dto/create-reading.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import { SensorsService } from './sensors.service';

@Controller('sensors')
export class SensorsController {
  constructor(
    private readonly sensors: SensorsService,
    private readonly alerts: AlertsService,
  ) {}

  @Post('readings')
  @UseGuards(DeviceTokenGuard)
  async ingest(@Body() dto: CreateReadingDto) {
    const result = await this.sensors.insert(dto);
    if (result.inserted && !result.suppress_alerts)
      await this.alerts.evaluate(dto.device_id, result.reading);
    return { ok: true, reading: result.reading };
  }

  @Get(':deviceId')
  @UseGuards(JwtGuard)
  latest(
    @CurrentUser() userId: string,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
  ) {
    return this.sensors.latest(userId, deviceId);
  }

  @Get(':deviceId/history')
  @UseGuards(JwtGuard)
  history(
    @CurrentUser() userId: string,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Query() query: HistoryQueryDto,
  ) {
    return this.sensors.history(userId, deviceId, query.from, query.to);
  }
}
