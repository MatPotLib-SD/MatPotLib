import { IsNotEmpty, IsString } from 'class-validator';

export class ClaimDeviceDto {
  @IsString()
  @IsNotEmpty()
  claim_code: string;
}
