import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtGuard } from '../common/jwt.guard';
import { ClaimDeviceDto } from './dto/claim-device.dto';
import { DevicesService } from './devices.service';

@Controller('devices')
@UseGuards(JwtGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('claim')
  claim(@CurrentUser() userId: string, @Body() dto: ClaimDeviceDto) {
    return this.devices.claim(userId, dto.claim_code);
  }

  @Get()
  list(@CurrentUser() userId: string) {
    return this.devices.list(userId);
  }

  @Delete(':id')
  unlink(
    @CurrentUser() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.devices.unlink(userId, id);
  }
}
