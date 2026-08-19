import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { EmailEventType, MessageStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MailService, MailSubmissionError } from "../smtp/mail.service";
import { SesAdminService } from "../smtp/ses-admin.service";
import type { SendEmailDto } from "../smtp/dto/send-email.dto";

export type MessageFilters = { domain?: string; recipient?: string; sender?: string; credential?: string; status?: MessageStatus; from?: Date; to?: Date; cursor?: string; limit: number };
const EVENT_TO_STATUS: Partial<Record<EmailEventType, MessageStatus>> = { SENT: "SENT", DELIVERED: "DELIVERED", DEFERRED: "DEFERRED", BOUNCED: "BOUNCED", COMPLAINED: "COMPLAINED", FAILED: "FAILED" };
const MAX_ATTEMPTS = 3;
const STALE_CLAIM_MS = 10 * 60 * 1000;
const MAX_WEBHOOK_BYTES = 100 * 1024;
export function retryDelayMs(attempt: number): number { return Math.min(60_000 * 2 ** Math.max(attempt - 1, 0), 15 * 60_000); }

@Injectable()
export class MessagesService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService, private readonly ses: SesAdminService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.processQueued().catch((err) => console.error("[MessagesService] processQueued failed", err));
    }, 5_000);
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async submit(tenantId: string, dto: SendEmailDto, fromEmail: string, fromName?: string, credentialId?: string) {
    if (!this.prisma.connected) throw new ServiceUnavailableException("Message queue requires PostgreSQL.");
    const domain = await this.ses.assertSenderDomainAllowed(fromEmail, tenantId, credentialId);
    const message = await this.prisma.emailMessage.create({ data: {
      tenantId, domainId: domain.id, credentialId, headerFrom: fromEmail, envelopeFrom: fromEmail,
      recipients: [dto.to.trim().toLowerCase()], subject: dto.subject.trim(), contentText: dto.text,
      contentHtml: dto.html, replyTo: dto.replyTo,
      events: { create: { providerEventId: `internal:${randomUUID()}`, type: "QUEUED", occurredAt: new Date() } },
    } });
    void this.processOne(message.id, fromName);
    return { messageId: message.id, status: message.status, accepted: message.recipients, rejected: [] as string[] };
  }

  async processQueued(): Promise<void> {
    if (!this.prisma.connected || !this.mail.isConfigured()) return;
    await this.failStaleClaims();
    const queued = await this.prisma.emailMessage.findMany({ where: { source: "API", status: "QUEUED", attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() } }, select: { id: true }, take: 20 });    for (const item of queued) await this.processOne(item.id);
  }

  async failStaleClaims(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_CLAIM_MS);
    const stale = await this.prisma.emailMessage.findMany({ where: { source: "API", status: "QUEUED", processingStartedAt: { lt: cutoff } }, select: { id: true } });    let failed = 0;
    for (const item of stale) {
      const result = await this.prisma.emailMessage.updateMany({ where: { id: item.id, status: "QUEUED", processingStartedAt: { lt: cutoff } }, data: { status: "FAILED", failureReason: "Worker claim expired; SMTP submission outcome is ambiguous and was not retried.", contentText: null, contentHtml: null, processingStartedAt: null } });
      failed += result.count;
    }
    return failed;
  }

  private async processOne(id: string, fromName?: string): Promise<void> {
    const claimed = await this.prisma.emailMessage.updateMany({ where: { id, status: "QUEUED", attempts: { lt: MAX_ATTEMPTS }, processingStartedAt: null }, data: { processingStartedAt: new Date(), attempts: { increment: 1 } } });
    if (!claimed.count) return;
    const message = await this.prisma.emailMessage.findUnique({ where: { id } });
    if (!message) return;
    try {
      const result = await this.mail.sendMail({ from: message.headerFrom, fromName, to: message.recipients.join(","), subject: message.subject ?? "", text: message.contentText ?? undefined, html: message.contentHtml ?? undefined, replyTo: message.replyTo ?? undefined });
      await this.prisma.emailMessage.update({ where: { id }, data: { providerMessageId: result.messageId, status: "SENT", sentAt: new Date(), contentText: null, contentHtml: null, processingStartedAt: null, events: { create: { providerEventId: `sent:${id}`, type: "SENT", occurredAt: new Date() } } } });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 1000) : "Provider submission failed";
      if (error instanceof MailSubmissionError && error.retrySafe && message.attempts < MAX_ATTEMPTS) {
        const nextAttemptAt = new Date(Date.now() + retryDelayMs(message.attempts));
        await this.prisma.emailMessage.update({ where: { id }, data: { status: "QUEUED", failureReason: reason, nextAttemptAt, processingStartedAt: null, events: { create: { providerEventId: `deferred:${id}:${message.attempts}`, type: "DEFERRED", occurredAt: new Date(), details: { reason, nextAttemptAt: nextAttemptAt.toISOString() } } } } });
        return;
      }
      await this.prisma.emailMessage.update({ where: { id }, data: { status: "FAILED", failureReason: reason, contentText: null, contentHtml: null, processingStartedAt: null, events: { create: { providerEventId: `failed:${id}`, type: "FAILED", occurredAt: new Date(), details: { reason } } } } });
    }
  }

  async list(tenantId: string, filters: MessageFilters) {
    const where: Prisma.EmailMessageWhereInput = { tenantId };
    if (filters.domain) where.domain = { name: filters.domain.toLowerCase() };
    if (filters.recipient) where.recipients = { has: filters.recipient.toLowerCase() };
    if (filters.sender) where.headerFrom = { contains: filters.sender, mode: "insensitive" };
    if (filters.credential) where.credentialId = filters.credential;
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) where.createdAt = { gte: filters.from, lte: filters.to };
    const rows = await this.prisma.emailMessage.findMany({ where, omit: { contentText: true, contentHtml: true }, include: { domain: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: filters.limit + 1, ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}) });
    const hasMore = rows.length > filters.limit; const items = hasMore ? rows.slice(0, filters.limit) : rows;
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async get(tenantId: string, id: string) {
    const message = await this.prisma.emailMessage.findFirst({ where: { id, tenantId }, omit: { contentText: true, contentHtml: true }, include: { domain: { select: { name: true } }, events: { orderBy: { occurredAt: "asc" } } } });
    if (!message) throw new NotFoundException("Message not found");
    return message;
  }

  verifyWebhookSecret(presented?: string): void {
    const expected = process.env.SES_EVENT_WEBHOOK_SECRET?.trim();
    if (!expected) throw new ServiceUnavailableException("SES event ingestion is not configured.");
    const a = createHash("sha256").update(presented ?? "").digest(); const b = createHash("sha256").update(expected).digest();
    if (!timingSafeEqual(a, b)) throw new UnauthorizedException("Invalid event webhook credential.");
  }

  async ingestSesEvent(payload: unknown) {
    const event = this.parseSesEvent(payload);
    const message = await this.prisma.emailMessage.findFirst({ where: { providerMessageId: event.providerMessageId } });
    if (!message) return { accepted: true, matched: false };
    const status = EVENT_TO_STATUS[event.type];
    try {
      await this.prisma.$transaction([
        this.prisma.emailEvent.create({ data: { messageId: message.id, providerEventId: event.id, type: event.type, occurredAt: event.at, details: event.details as Prisma.InputJsonValue } }),
        ...(status ? [this.prisma.emailMessage.update({ where: { id: message.id }, data: { status } })] : []),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { accepted: true, matched: true, duplicate: true };
      throw error;
    }
    return { accepted: true, matched: true, duplicate: false };
  }

  parseSesEvent(value: unknown): { id: string; providerMessageId: string; type: EmailEventType; at: Date; details: Record<string, unknown> } {
    if (!value || typeof value !== "object") throw new ForbiddenException("Invalid SES event payload.");
    let serialized: string; try { serialized = JSON.stringify(value); } catch { throw new BadRequestException("SES event payload is not serializable."); }
    if (Buffer.byteLength(serialized, "utf8") > MAX_WEBHOOK_BYTES) throw new BadRequestException("SES event payload is too large.");
    const outer = value as Record<string, unknown>; let body: Record<string, unknown>;
    try { body = typeof outer.Message === "string" ? JSON.parse(outer.Message) as Record<string, unknown> : outer; } catch { throw new BadRequestException("SNS Message must contain valid JSON."); }
    const mail = body.mail as Record<string, unknown> | undefined;
    const providerMessageId = typeof mail?.messageId === "string" ? mail.messageId : "";
    const rawType = String(body.eventType ?? body.notificationType ?? "").toUpperCase();
    const aliases: Record<string, EmailEventType> = { SEND: "SENT", DELIVERY: "DELIVERED", BOUNCE: "BOUNCED", COMPLAINT: "COMPLAINED", REJECT: "FAILED", RENDERINGFAILURE: "FAILED", DELIVERYDELAY: "DEFERRED", OPEN: "OPENED", CLICK: "CLICKED" };
    const type = aliases[rawType]; if (!providerMessageId || !type) throw new ForbiddenException("Unsupported SES event payload.");
    const at = new Date(String(mail?.timestamp ?? outer.Timestamp ?? Date.now()));
    const id = typeof outer.MessageId === "string" ? outer.MessageId : createHash("sha256").update(JSON.stringify(body)).digest("hex");
    return { id: `ses:${id}:${rawType}`, providerMessageId, type, at: Number.isNaN(at.valueOf()) ? new Date() : at, details: { eventType: rawType } };
  }
}
