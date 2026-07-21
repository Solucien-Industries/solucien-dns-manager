import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

class ModerationPasswordDto {
  @ApiProperty({ example: "owner-confirmation-password" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  adminPassword!: string;
}

export class WarnDto extends ModerationPasswordDto {
  @ApiProperty({ example: "Repeated abuse reports from recipients." })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class BanDto extends WarnDto { }

export class SuspendDto extends WarnDto {
  @ApiProperty({
    required: false,
    example: "2026-08-01T00:00:00.000Z",
    description: "When the suspension lifts. Omit for an indefinite suspension.",
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
