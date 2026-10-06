import { IsUUID, IsNumber, IsInt, Min, Max, IsOptional } from 'class-validator';

export class CreateReadingDto {
  @IsUUID() device_id: string;
  @IsNumber() @Min(0) @Max(100) moisture: number;
  @IsNumber() @Min(-40) @Max(85) temp_c: number;
  @IsNumber() @Min(0) @Max(100) humidity: number;
  @IsNumber() @Min(0) @Max(200000) lux: number;
  @IsOptional() @IsNumber() battery_pct?: number;
  @IsOptional() @IsUUID() capture_request_id?: string;
  @IsOptional() @IsInt() @Min(0) @Max(300000) sample_age_ms?: number;
}
