import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtOrApiKeyGuard } from "../api-keys/jwt-or-api-key.guard";
import { SendSmsDto } from "./sms.dto";
import { SmsService } from "./sms.service";

@ApiTags("sms")
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyGuard)
@Controller("sms")
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @Post("send")
  async send(@Body() dto: SendSmsDto, @Req() req: Request) {
    const user = req.user as { userId?: string; tenantId?: string };
    return this.sms.send({
      ...dto,
      tenantId: user.tenantId ?? "ephemeral-tenant",
      userId: user.userId,
    });
  }
}
