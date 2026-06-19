import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateSmtpSenderDto {
  @ApiProperty({ required: false, example: "notifications@solucien.cd" })
  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @ApiProperty({ required: false, example: "Solucien DNS" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  fromName?: string;
}
