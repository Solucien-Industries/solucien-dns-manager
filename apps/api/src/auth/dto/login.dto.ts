import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString } from "class-validator";

/**
 * Login / session-exchange payload. In production the web app authenticates the
 * user via Auth.js (OAuth) and posts the verified profile here to receive an API JWT.
 */
export class LoginDto {
  @ApiProperty({ example: "ops@soluciendns.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, example: "Solucien Ops" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: "google", description: "OAuth provider id" })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({
    required: false,
    example: "203.0.113.10",
    description:
      "Originating browser IP, forwarded by the web server. Login is a server-to-server exchange, so req.ip is the web host — this carries the real client address for location tracking.",
  })
  @IsOptional()
  @IsString()
  clientIp?: string;
}
