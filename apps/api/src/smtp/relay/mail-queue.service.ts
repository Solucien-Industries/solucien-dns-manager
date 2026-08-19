import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";

export const DELIVERY_QUEUE = "nani.delivery";

export type DeliveryJob = {
  messageId: string;
  tenantId: string;
  domainId: string;
};

/**
 * Hands accepted messages to the delivery worker (story 9).
 *
 * The durability model, which is the whole point of story 8:
 *
 *   1. The Postgres `EmailMessage` row (status = QUEUED) is the system of
 *      record. It is committed inside the same transaction as the raw MIME.
 *   2. BullMQ/Redis is a *dispatcher*, not the record. It exists to wake a
 *      worker promptly.
 *   3. We only return 250 after step 1 commits. If step 2 then fails, the
 *      message is still safe and `sweepOrphans` re-enqueues it.
 *
 * The alternative — enqueue to Redis, return 250, write to Postgres later —
 * loses customer mail on a Redis restart while having already told the client
 * we owned it. Never do that.
 */
@Injectable()
export class MailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailQueueService.name);
  private queue: Queue<DeliveryJob> | null = null;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.queue = new Queue<DeliveryJob>(DELIVERY_QUEUE, {
      connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
      defaultJobOptions: {
        attempts: Number(process.env.SMTP_DELIVERY_ATTEMPTS ?? 8),
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: { age: 3600, count: 5000 },
        removeOnFail: false,
      },
    });

    const intervalMs = Number(process.env.SMTP_SWEEP_INTERVAL_MS ?? 60_000);
    this.sweeper = setInterval(() => {
      void this.sweepOrphans();
    }, intervalMs);
    this.sweeper.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    await this.queue?.close();
  }

  /**
   * Enqueue a message that is already durably persisted.
   *
   * `jobId` is the message id, which makes this idempotent: if the sweeper and
   * the intake path both enqueue the same message, BullMQ keeps one job. Without
   * this, a sweeper run during a slow enqueue sends the message twice.
   */
  async enqueue(job: DeliveryJob): Promise<boolean> {
    if (!this.queue) return false;
    try {
      await this.queue.add("deliver", job, { jobId: job.messageId });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      this.logger.error(`Enqueue failed for ${job.messageId}: ${message} — sweeper will retry`);
      return false;
    }
  }

  /**
   * Re-enqueue messages that committed to Postgres but never made it onto the
   * queue (Redis was down, the process died between commit and add).
   *
   * The grace period matters: without it this races the intake path and picks
   * up messages that are milliseconds away from being enqueued normally.
   */
  async sweepOrphans(): Promise<number> {
    if (!this.queue) return 0;
    const graceMs = Number(process.env.SMTP_SWEEP_GRACE_MS ?? 120_000);
    const cutoff = new Date(Date.now() - graceMs);

    try {
      // Uses the [status, nextAttemptAt] index. Scoped to source SMTP so the
      // sweeper never touches messages the REST API path owns.
      const stranded = await this.prisma.emailMessage.findMany({
        where: { status: "QUEUED", source: "SMTP", nextAttemptAt: { lt: cutoff } },
        select: { id: true, tenantId: true, domainId: true },
        take: 500,
      });

      let recovered = 0;
      for (const message of stranded) {
        const existing = await this.queue.getJob(message.id);
        if (existing) continue;
        const ok = await this.enqueue({
          messageId: message.id,
          tenantId: message.tenantId,
          domainId: message.domainId,
        });
        if (ok) recovered += 1;
      }

      if (recovered > 0) this.logger.warn(`Sweeper re-enqueued ${recovered} stranded message(s)`);
      return recovered;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      this.logger.error(`Sweep failed: ${message}`);
      return 0;
    }
  }
}
