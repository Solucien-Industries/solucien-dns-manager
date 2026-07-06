import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateApprovedLocationDto {
  @ApiProperty({ enum: ["CIDR", "COUNTRY"], example: "COUNTRY" })
  @IsIn(["CIDR", "COUNTRY"])
  type!: "CIDR" | "COUNTRY";

  @ApiProperty({
    example: "CD",
    description: "An ISO-3166 alpha-2 country code (for COUNTRY) or a CIDR range like 203.0.113.0/24 (for CIDR).",
  })
  @IsString()
  @MaxLength(64)
  value!: string;

  @ApiProperty({ required: false, example: "Kinshasa office" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
