import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { RECORD_TYPES, type RecordType } from "@solucien/shared";

export class CreateRecordDto {
  @ApiProperty({ example: "solucien.cd", description: "Domain the record belongs to" })
  @IsString()
  domain!: string;

  @ApiProperty({ enum: RECORD_TYPES, example: "A" })
  @IsIn(RECORD_TYPES)
  type!: RecordType;

  @ApiProperty({ example: "www", description: "Relative record name, '@' for apex" })
  @IsString()
  name!: string;

  @ApiProperty({ example: "196.29.43.18" })
  @IsString()
  value!: string;

  @ApiProperty({ example: 300, default: 300 })
  @IsInt()
  @Min(1)
  @Max(604800)
  ttl: number = 300;

  @ApiProperty({ required: false, example: 10, description: "Priority (MX records)" })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
