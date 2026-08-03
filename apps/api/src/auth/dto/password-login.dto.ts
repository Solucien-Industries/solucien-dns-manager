import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class PasswordLoginDto {
  @ApiProperty({ example: "ops@soluciendns.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "a strong password" })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @ApiProperty({
    required: false,
    example: "203.0.113.10",
    description: "Originating browser IP, forwarded by the web server.",
  })
  @IsOptional()
  @IsString()
  clientIp?: string;
}
