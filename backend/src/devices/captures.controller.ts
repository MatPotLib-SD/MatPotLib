import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { DeviceTokenGuard } from '../common/device-token.guard';
import { JwtGuard } from '../common/jwt.guard';
import { CapturesService } from './captures.service';
import { CreateCaptureDto } from './dto/create-capture.dto';
import { FailCaptureDto } from './dto/fail-capture.dto';
import { PollCaptureDto } from './dto/poll-capture.dto';

@Controller('devices')
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Post('captures/poll')
  @HttpCode(200)
  @UseGuards(DeviceTokenGuard)
  poll(@Body() dto: PollCaptureDto) {
    return this.captures.poll(dto.device_id);
  }

  @Post('captures/:captureId/fail')
  @UseGuards(DeviceTokenGuard)
  fail(
    @Param('captureId', new ParseUUIDPipe()) captureId: string,
    @Body() dto: FailCaptureDto,
  ) {
    return this.captures.fail(dto.device_id, captureId, dto.reason);
  }

  @Post(':deviceId/captures/cancel-pending')
  @UseGuards(JwtGuard)
  cancelPending(
    @CurrentUser() userId: string,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Body() dto: CreateCaptureDto,
  ) {
    return this.captures.cancelPending(userId, deviceId, dto.idempotency_key);
  }

  @Post(':deviceId/captures')
  @UseGuards(JwtGuard)
  create(
    @CurrentUser() userId: string,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Body() dto: CreateCaptureDto,
  ) {
    return this.captures.create(userId, deviceId, dto.idempotency_key);
  }

  @Get(':deviceId/active-capture')
  @UseGuards(JwtGuard)
  active(
    @CurrentUser() userId: string,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
  ) {
    return this.captures.active(userId, deviceId);
  }

  @Get(':deviceId/captures/:captureId')
  @UseGuards(JwtGuard)
  get(
    @CurrentUser() userId: string,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Param('captureId', new ParseUUIDPipe()) captureId: string,
  ) {
    return this.captures.get(userId, deviceId, captureId);
  }

  @Post(':deviceId/captures/:captureId/cancel')
  @UseGuards(JwtGuard)
  cancel(
    @CurrentUser() userId: string,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Param('captureId', new ParseUUIDPipe()) captureId: string,
  ) {
    return this.captures.cancel(userId, deviceId, captureId);
  }
}
