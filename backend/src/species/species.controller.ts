import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../common/jwt.guard';
import { SpeciesService } from './species.service';

@Controller('species')
@UseGuards(JwtGuard)
export class SpeciesController {
  constructor(private readonly species: SpeciesService) {}

  @Get()
  search(@Query('q') q?: string) {
    return this.species.search(q);
  }
}
