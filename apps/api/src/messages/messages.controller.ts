import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MessageStatus } from "@prisma/client";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SendEmailDto } from "../smtp/dto/send-email.dto";
import { SmtpService } from "../smtp/smtp.service";
import { MessagesService } from "./messages.service";

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
  @Post("events/ses")
  ingest(@Headers("x-nani-webhook-secret") secret: string | undefined, @Body() body: unknown) { this.messages.verifyWebhookSecret(secret); return this.messages.ingestSesEvent(body); }
}
