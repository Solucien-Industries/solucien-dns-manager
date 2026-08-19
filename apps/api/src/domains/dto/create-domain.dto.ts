import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, Matches } from "class-validator";
import { Transform } from "class-transformer";
import { domainToASCII } from "url";

export class CreateDomainDto {
  @ApiProperty({ example: "example.com", description: "Fully-qualified domain name" })
  @IsString()
  @Transform(({ value }) => typeof value === "string" ? domainToASCII(value.trim().replace(/\.$/, "").toLowerCase()) : value)
  @Matches(/^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i, { message: "name must be a valid root domain or subdomain" })
  name!: string;

  @ApiProperty({ example: "Solucien Industries" })
  @IsString()
  owner!: string;

  @ApiProperty({ required: false, example: ".cd" })
  @IsOptional()
  @IsString()
  tld?: string;
}
