import { IsString, IsUUID, Length } from 'class-validator';

export class FailCaptureDto {
  @IsUUID() device_id: string;
  @IsString() @Length(1, 200) reason: string;
}
