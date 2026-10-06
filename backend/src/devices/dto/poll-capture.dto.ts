import { IsUUID } from 'class-validator';

export class PollCaptureDto {
  @IsUUID() device_id: string;
}
