import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePlantDto {
  @IsString()
  @IsNotEmpty()
  nickname: string;

  @IsOptional()
  @IsUUID()
  device_id?: string;

  @IsOptional()
  @IsUUID()
  plant_species_id?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
