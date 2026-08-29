import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtGuard } from '../common/jwt.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
@UseGuards(JwtGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me')
  getMe(@CurrentUser() userId: string) {
    return this.profiles.getOrCreate(userId);
  }

  @Put('me')
  updateMe(@CurrentUser() userId: string, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(userId, dto);
  }
}
