import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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

  @ApiProperty({
    example: "my-location-passkey",
    description:
      "Password or passkey required before adding a new trusted location. Set LOCATION_APPROVAL_PASSKEY or LOCATION_APPROVAL_PASSWORD in API env.",
  })
  @IsString()
  @MinLength(6)
  @MaxLength(200)
  approvalSecret!: string;
}
