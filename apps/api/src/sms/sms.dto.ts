import { IsNotEmpty, IsOptional, IsString, Length, Matches } from "class-validator";

export class SendSmsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{5,14}$/, { message: "to must be a valid phone number" })
  to!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 160)
  message!: string;

  @IsOptional()
  @IsString()
  from?: string;
}

export type SmsSendInput = SendSmsDto & { tenantId: string; userId?: string };

export type SmsSendResult = {
  provider: string;
  status: string;
  messageId: string;
  to: string;
  message: string;
  tenantId: string;
  note?: string;
};
