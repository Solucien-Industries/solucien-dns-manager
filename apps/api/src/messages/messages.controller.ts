import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MessageStatus } from "@prisma/client";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SendEmailDto } from "../smtp/dto/send-email.dto";
import { SmtpService } from "../smtp/smtp.service";
import { MessagesService } from "./messages.service";
import { assertSnsAuthentic, confirmSubscriptionIfNeeded } from "./sns-signature";


@ApiTags("messages")
@Controller("messages")
export class MessagesController {
  constructor(private readonly messages: MessagesService, private readonly smtp: SmtpService) {}
  @Post() @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  submit(@Req() req: Request, @Body() dto: SendEmailDto) {
    if (!dto.text && !dto.html) throw new BadRequestException("Provide a text body, an html body, or both.");
    const tenantId = (req.user as { tenantId: string }).tenantId; const sender = this.smtp.getSender(tenantId);
    const fromEmail = (dto.fromEmail ?? sender.fromEmail).trim(); if (!fromEmail) throw new BadRequestException("No sender identity is configured.");
    return this.messages.submit(tenantId, dto, fromEmail, sender.fromName);
  }
  @Get() @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  list(@Req() req: Request, @Query() q: Record<string, string | undefined>) {
    return this.messages.list((req.user as { tenantId: string }).tenantId, { domain: q.domain, recipient: q.recipient, sender: q.sender, credential: q.credential, status: q.status && Object.values(MessageStatus).includes(q.status as MessageStatus) ? q.status as MessageStatus : undefined, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined, cursor: q.cursor, limit: Math.min(Math.max(Number(q.limit) || 25, 1), 100) });
  }
  @Get(":id") @ApiBearerAuth() @UseGuards(JwtAuthGuard)
  get(@Req() req: Request, @Param("id") id: string) { return this.messages.get((req.user as { tenantId: string }).tenantId, id); }

  /**
   * SES delivery, bounce and complaint events, delivered by SNS.
   *
   * No guard: Amazon cannot present a bearer token, and SNS HTTPS subscriptions
   * cannot send custom headers either — which is why the previous
   * `x-nani-webhook-secret` check could never have received a real event.
   * Authenticity comes from the signature on the message body instead.
   */
  @Post("events/ses")
  async ingest(@Body() body: unknown) {
    const envelope = await assertSnsAuthentic(body);
    if (await confirmSubscriptionIfNeeded(envelope)) return { accepted: true, confirmed: true };
    return this.messages.ingestSesEvent(body);
  }
}