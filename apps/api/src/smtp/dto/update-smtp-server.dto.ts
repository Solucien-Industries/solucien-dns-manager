import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateSmtpServerDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false, example: "smtp.nani.dns" })
  @IsOptional()
  @IsString()
  host?: string;

  @ApiProperty({ required: false, example: 587 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({ required: false, enum: ["STARTTLS", "SSL/TLS"] })
  @IsOptional()
  @IsIn(["STARTTLS", "SSL/TLS"])
  encryption?: "STARTTLS" | "SSL/TLS";

  @ApiProperty({ required: false, example: "Europe" })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ required: false, enum: ["active", "maintenance"] })
  @IsOptional()
  @IsIn(["active", "maintenance"])
  status?: "active" | "maintenance";
}
