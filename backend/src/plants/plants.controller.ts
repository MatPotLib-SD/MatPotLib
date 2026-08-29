import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtGuard } from '../common/jwt.guard';
import { CreatePlantDto } from './dto/create-plant.dto';
import { UpdatePlantDto } from './dto/update-plant.dto';
import { PlantsService } from './plants.service';

@Controller('plants')
@UseGuards(JwtGuard)
export class PlantsController {
  constructor(private readonly plants: PlantsService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.plants.list(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreatePlantDto) {
    return this.plants.create(userId, dto);
  }

  @Get(':id')
  get(
    @CurrentUser() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.plants.get(userId, id);
  }

  @Put(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePlantDto,
  ) {
    return this.plants.update(userId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.plants.remove(userId, id);
  }
}
