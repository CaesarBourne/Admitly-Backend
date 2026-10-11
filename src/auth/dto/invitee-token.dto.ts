import { IsNotEmpty, IsString } from 'class-validator';

export class InviteeTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
