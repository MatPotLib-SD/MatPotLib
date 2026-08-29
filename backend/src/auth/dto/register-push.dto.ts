import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterPushDto {
  @IsString()
  @IsNotEmpty()
  expo_token: string;

  @IsOptional()
  @IsString()
  platform?: string;
}
