import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateApiKeyDto {
  @ApiProperty({ example: "CI deployment" })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name!: string;
}
