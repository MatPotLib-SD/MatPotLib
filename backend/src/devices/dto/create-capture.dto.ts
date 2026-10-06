import { IsString, Length } from 'class-validator';

export class CreateCaptureDto {
  @IsString() @Length(1, 128) idempotency_key: string;
}
