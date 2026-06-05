import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, Matches } from "class-validator";

export class CreateDomainDto {
  @ApiProperty({ example: "solucien.cd", description: "Fully-qualified domain name" })
  @IsString()
  @Matches(/^([a-z0-9-]+\.)+[a-z]{2,}$/i, { message: "name must be a valid domain" })
  name!: string;

  @ApiProperty({ example: "Solucien Industries" })
  @IsString()
  owner!: string;

  @ApiProperty({ required: false, example: ".cd" })
  @IsOptional()
  @IsString()
  tld?: string;
}
