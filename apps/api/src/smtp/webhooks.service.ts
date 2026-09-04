import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type WebhookSummary = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastDeliveredAt: string | null;
  lastStatus: number | null;
  failureCount: number;
};

export type WebhookCreated = {
  webhook: WebhookSummary;
  /** Shown once. Customers verify the X-Nani-Signature header with this. */
  secret: string;
};

const DELIVERABLE_EVENTS = ["QUEUED", "SENT", "DELIVERED", "DEFERRED", "BOUNCED", "COMPLAINED", "FAILED", "OPENED", "CLICKED"];

/**
 * Story 10: notify the customer's own systems when a message's state changes.
 *
 * The logs API answers "what happened to this message" when someone asks.
 * Webhooks answer it without anyone asking, which is what an application needs
 * to suppress a bounced address or flag a complaint automatically.
 *
 * Every request is signed with an HMAC over the timestamp and body. Without
 * that, a customer's webhook endpoint has no way to distinguish our POST from
 * anyone else's, and "this address bounced" becomes a message an attacker can
 * forge to poison a customer's suppression list.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<WebhookSummary[]> {
    const rows = await this.prisma.webhook.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row: WebhookRow) => this.toSummary(row));
  }

  async create(
    tenantId: string,
    input: { url: string; events?: string[] },
  ): Promise<WebhookCreated> {
    const url = input.url?.trim() ?? "";

    // https only: the payload carries recipient addresses and delivery state,
    // and http would put those on the wire in clear text.
    if (!/^https:\/\//i.test(url)) {
      throw new ForbiddenException("Webhook URLs must use https.");
    }

    const events = (input.events ?? DELIVERABLE_EVENTS).filter((event) => DELIVERABLE_EVENTS.includes(event));
    if (!events.length) throw new ForbiddenException("Select at least one event type.");

    const secret = `whsec_${randomBytes(24).toString("base64url")}`;

    const created = await this.prisma.webhook.create({
      data: { tenantId, url, events, secret, active: true },
    });

    return { webhook: this.toSummary(created), secret };
  }

  async remove(id: string, tenantId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException("Webhook not found in this workspace.");
    }
    await this.prisma.webhook.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Fan an event out to every subscribed endpoint for the tenant.
   *
   * Called from the event ingestion path. Deliberately not awaited by the
   * caller: a customer's slow or broken endpoint must never delay our own
   * processing, and must never turn into a failed SES event ingestion.
   */
  async dispatch(tenantId: string, event: {
    type: string;
    messageId: string;
    recipient?: string | null;
    domain?: string | null;
    providerResponse?: string | null;
    occurredAt?: Date;
  }): Promise<void> {
    let hooks: WebhookRow[];
    try {
      hooks = await this.prisma.webhook.findMany({ where: { tenantId, active: true } });
    } catch (error) {
      this.logger.warn(`Could not load webhooks: ${error instanceof Error ? error.message : "unknown"}`);
      return;
    }

    const subscribed = hooks.filter((hook) => hook.events.includes(event.type));
    if (!subscribed.length) return;

    const payload = JSON.stringify({
      type: event.type,
      message_id: event.messageId,
      recipient: event.recipient ?? null,
      domain: event.domain ?? null,
      provider_response: event.providerResponse ?? null,
      occurred_at: (event.occurredAt ?? new Date()).toISOString(),
    });

    await Promise.all(subscribed.map((hook) => this.deliver(hook, payload)));
  }

  /** Verify a signature — exported so customers can be shown working sample code. */
  static verifySignature(secret: string, timestamp: string, body: string, signature: string): boolean {
    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  }

  /* ---------------------------------------------------------------------- */

  private async deliver(hook: WebhookRow, payload: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", hook.secret).update(`${timestamp}.${payload}`).digest("hex");

    // The timestamp is inside the signed string so a captured request cannot be
    // replayed later — the customer checks it is recent before trusting it.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000));

    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nani-Signature": signature,
          "X-Nani-Timestamp": timestamp,
        },
        body: payload,
        signal: controller.signal,
      });

      await this.prisma.webhook.update({
        where: { id: hook.id },
        data: {
          lastDeliveredAt: new Date(),
          lastStatus: res.status,
          // Reset on success so an endpoint that recovers is not disabled by
          // failures from days ago.
          failureCount: res.ok ? 0 : { increment: 1 },
        },
      });

      if (!res.ok) this.logger.warn(`Webhook ${hook.id} returned ${res.status}`);
      await this.disableIfHopeless(hook.id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown";
      this.logger.warn(`Webhook ${hook.id} failed: ${detail}`);

      await this.prisma.webhook
        .update({
          where: { id: hook.id },
          data: { failureCount: { increment: 1 }, lastStatus: null },
        })
        .catch(() => undefined);

      await this.disableIfHopeless(hook.id);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Stop calling an endpoint that has been failing for a long time.
   *
   * A customer who decommissions a server without deleting the webhook would
   * otherwise have us POST to a dead host on every event, indefinitely — which
   * costs us throughput and can look like an attack from their side.
   */
  private async disableIfHopeless(id: string): Promise<void> {
    const limit = Number(process.env.WEBHOOK_FAILURE_LIMIT ?? 50);
    try {
      const hook = await this.prisma.webhook.findUnique({ where: { id }, select: { failureCount: true } });
      if (hook && hook.failureCount >= limit) {
        await this.prisma.webhook.update({ where: { id }, data: { active: false } });
        this.logger.warn(`Disabled webhook ${id} after ${hook.failureCount} consecutive failures`);
      }
    } catch {
      /* housekeeping only */
    }
  }

  private toSummary(row: WebhookRow): WebhookSummary {
    return {
      id: row.id,
      url: row.url,
      events: row.events,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      lastDeliveredAt: row.lastDeliveredAt ? row.lastDeliveredAt.toISOString() : null,
      lastStatus: row.lastStatus,
      failureCount: row.failureCount,
    };
  }
}

type WebhookRow = {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: Date;
  lastDeliveredAt: Date | null;
  lastStatus: number | null;
  failureCount: number;
};
