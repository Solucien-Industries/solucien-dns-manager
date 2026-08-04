import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SendEmailDto {
  @ApiProperty({ example: "customer@example.com", description: "Recipient email address." })
  @IsEmail()
  to!: string;

  @ApiProperty({ example: "Your DNS zone is ready" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ required: false, description: "Plain-text body. Provide this and/or html." })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  text?: string;

  @ApiProperty({ required: false, description: "HTML body. Provide this and/or text." })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  html?: string;

  @ApiProperty({
    required: false,
    description: "Override the saved sender From address. Must be a verified SES identity.",
    example: "notifications@solucien.cd",
  })
  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @ApiProperty({ required: false, example: "support@solucien.cd" })
  @IsOptional()
  @IsEmail()
  replyTo?: string;
}
