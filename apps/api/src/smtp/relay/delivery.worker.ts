import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { Job, Worker } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { DELIVERY_QUEUE, type DeliveryJob } from "./mail-queue.service";

/**
 * Story 9 — deliver a queued message.
 *
 * Consumes `nani.delivery`, loads the raw MIME stored at intake, and hands it to
 * SES. There is deliberately no DKIM signing code here: the platform uses SES
 * Easy DKIM, so AWS holds the private key and signs on the outbound hop. Sending
 * the bytes unmodified is what makes that signature valid — this worker must
 * never re-serialise the message.
 *
 * Scoped to `source: "SMTP"`. `MessagesService` owns the REST submission path on
 * its own timer; two workers over one table stay apart on that discriminator.
 */
@Injectable()
export class DeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryWorker.name);
  private worker: Worker<DeliveryJob> | null = null;
  private ses: SESv2Client | null = null;
  private staleTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.SMTP_DELIVERY_ENABLED === "false") {
      this.logger.warn("Delivery worker disabled by SMTP_DELIVERY_ENABLED=false");
      return;
    }

    this.ses = new SESv2Client({
      region: process.env.AWS_REGION ?? process.env.SES_REGION ?? "eu-north-1",
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });

    this.worker = new Worker<DeliveryJob>(
      DELIVERY_QUEUE,
      async (job) => this.deliver(job),
      {
        connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
        concurrency: Number(process.env.SMTP_DELIVERY_CONCURRENCY ?? 5),
      },
    );

    this.worker.on("failed", (job, err) => {
      this.logger.warn(`Delivery job ${job?.id ?? "?"} failed: ${err.message}`);
    });
    this.worker.on("error", (err) => {
      this.logger.error(`Delivery worker error: ${err.message}`);
    });

    this.staleTimer = setInterval(() => void this.resetStaleClaims(), 120_000);
    this.staleTimer.unref();

    this.logger.log("Delivery worker listening on queue " + DELIVERY_QUEUE);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.staleTimer) clearInterval(this.staleTimer);
    await this.worker?.close();
    this.ses?.destroy();
  }

  private async deliver(job: Job<DeliveryJob>): Promise<void> {
    const { messageId } = job.data;

    // --- Claim -------------------------------------------------------------
    // updateMany + count is the lock: exactly one worker can move a message out
    // of QUEUED/DEFERRED, so a duplicated job can never send the message twice.
    const claimed = await this.prisma.emailMessage.updateMany({
      where: {
        id: messageId,
        source: "SMTP",
        status: { in: ["QUEUED", "DEFERRED"] },
        processingStartedAt: null,
      },
      data: { processingStartedAt: new Date(), attempts: { increment: 1 } },
    });

    if (!claimed.count) {
      this.logger.log(`Skipping ${messageId}: already claimed or not deliverable`);
      return;
    }

    const message = await this.prisma.emailMessage.findUnique({
      where: { id: messageId },
      include: { raw: true, domain: { select: { name: true } } },
    });

    if (!message) {
      this.logger.error(`${messageId} vanished after claim`);
      return;
    }

    if (!message.raw) {
      // No bytes to send and no way to reconstruct them. Permanent.
      await this.markFailed(messageId, "Raw MIME missing for SMTP submission");
      return;
    }

    // --- Send --------------------------------------------------------------
    try {
      const result = await this.ses!.send(
        new SendEmailCommand({
          // Envelope recipients come from RCPT TO, which can legitimately differ
          // from the To/Cc headers (bcc, forwarding). Use what the client gave us.
          Destination: { ToAddresses: message.recipients },
          // Platform-controlled return path, so bounces come back to us.
          ...(message.envelopeFrom ? { FeedbackForwardingEmailAddress: message.envelopeFrom } : {}),
          Content: { Raw: { Data: new Uint8Array(message.raw.mime) } },
          ...(process.env.SES_CONFIGURATION_SET
            ? { ConfigurationSetName: process.env.SES_CONFIGURATION_SET }
            : {}),
          EmailTags: [
            { Name: "tenant", Value: sanitiseTag(message.tenantId) },
            { Name: "domain", Value: sanitiseTag(message.domain.name) },
          ],
        }),
      );

      await this.prisma.$transaction([
        this.prisma.emailMessage.update({
          where: { id: messageId },
          data: {
            status: "SENT",
            sentAt: new Date(),
            providerMessageId: result.MessageId ?? null,
            processingStartedAt: null,
            failureReason: null,
          },
        }),
        this.prisma.emailEvent.create({
          data: {
            messageId,
            type: "SENT",
            providerEventId: result.MessageId ? `ses:${result.MessageId}` : null,
            occurredAt: new Date(),
          },
        }),
      ]);

      this.logger.log(`Delivered ${messageId} to SES as ${result.MessageId ?? "(no id)"}`);
    } catch (error) {
      const reason = errorMessage(error);

      if (isPermanent(error)) {
        await this.markFailed(messageId, reason);
        this.logger.warn(`${messageId} permanently failed: ${reason}`);
        return; // resolve the job — retrying a permanent failure is pointless
      }

      // Transient: release the claim, record the reason, and let BullMQ's
      // exponential backoff schedule the retry.
      await this.prisma.$transaction([
        this.prisma.emailMessage.update({
          where: { id: messageId },
          data: {
            status: "DEFERRED",
            failureReason: reason.slice(0, 1000),
            processingStartedAt: null,
            nextAttemptAt: new Date(Date.now() + retryDelayMs(message.attempts)),
          },
        }),
        this.prisma.emailEvent.create({
          data: { messageId, type: "DEFERRED", occurredAt: new Date(), details: { reason } },
        }),
      ]);

      this.logger.warn(`${messageId} deferred: ${reason}`);
      throw error instanceof Error ? error : new Error(reason);
    }
  }

  /**
   * Recover messages whose worker died between claiming and writing the result
   * — a deploy, a crash, or a dev-mode restart mid-send. Without this they keep
   * `processingStartedAt` set forever and are never retried or reported.
   *
   * The window is genuinely dangerous: if the process died *after* SES accepted
   * the message, retrying means the recipient gets it twice. Ten minutes is long
   * enough that any in-flight send has certainly resolved either way, and a
   * duplicate is the better failure — a silently lost message is invisible to
   * everyone, including the customer.
   */
  private async resetStaleClaims(): Promise<void> {
    const cutoff = new Date(Date.now() - Number(process.env.SMTP_STALE_CLAIM_MS ?? 600_000));
    try {
      const reset = await this.prisma.emailMessage.updateMany({
        where: {
          source: "SMTP",
          status: { in: ["QUEUED", "DEFERRED"] },
          processingStartedAt: { lt: cutoff },
        },
        data: { processingStartedAt: null },
      });
      if (reset.count) this.logger.warn(`Reset ${reset.count} stale delivery claim(s)`);
    } catch (error) {
      this.logger.error(`Stale claim reset failed: ${errorMessage(error)}`);
    }
  }

  private async markFailed(messageId: string, reason: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emailMessage.update({
        where: { id: messageId },
        data: {
          status: "FAILED",
          failureReason: reason.slice(0, 1000),
          processingStartedAt: null,
        },
      }),
      this.prisma.emailEvent.create({
        data: { messageId, type: "FAILED", occurredAt: new Date(), details: { reason } },
      }),
    ]);
  }
}

/**
 * Permanent failures: retrying cannot succeed, so stop and tell the customer.
 * Everything else — throttling, 5xx, network faults, unknown errors — is treated
 * as transient. A retried duplicate is a far cheaper mistake than a message
 * thrown away because of a fault that would have cleared in a minute.
 */
function isPermanent(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? "";
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

  const permanentNames = new Set([
    "MessageRejected",
    "MailFromDomainNotVerifiedException",
    "AccountSuspendedException",
    "SendingPausedException",
    "BadRequestException",
    "NotFoundException",
  ]);

  if (permanentNames.has(name)) return true;

  // 4xx other than throttling is a request the retry would repeat verbatim.
  if (status && status >= 400 && status < 500) {
    return name !== "TooManyRequestsException" && name !== "ThrottlingException";
  }

  return false;
}

/** Same curve as MessagesService: 1 min doubling to a 15 min ceiling. */
function retryDelayMs(attempt: number): number {
  return Math.min(60_000 * 2 ** Math.max(attempt - 1, 0), 15 * 60_000);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return "Unknown delivery failure";
}

/** SES tag values allow only alphanumerics, hyphen and underscore. */
function sanitiseTag(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}