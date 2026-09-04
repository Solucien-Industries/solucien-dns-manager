import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SendingDomainService } from "./sending-domain.service";

export type ReputationSnapshot = {
  domain: string;
  sent: number;
  bounced: number;
  complained: number;
  bounceRate: number;
  complaintRate: number;
  operationalStatus: string;
  atRisk: boolean;
};

// AWS suspends accounts above 5% bounce or 0.1% complaint. We act well before
// that: by the time AWS notices, the damage to deliverability is already done
// and it is shared across every tenant on the platform.
const BOUNCE_SUSPEND_RATE = 0.05;
const COMPLAINT_SUSPEND_RATE = 0.001;
const MIN_SAMPLE = 50;

/**
 * Story 12: watch each sending domain's reputation and suspend the ones
 * damaging it.
 *
 * The reason this is automatic rather than a dashboard someone checks: SES
 * reputation is account-wide. One tenant mailing a purchased list degrades
 * delivery for every other customer, and the platform has no way to explain
 * that to them. Cutting off the offender quickly is what protects everyone
 * else's mail.
 *
 * The minimum sample size matters as much as the thresholds — two bounces out
 * of three sends is 66%, and suspending a domain on its first day of testing
 * would be both wrong and infuriating.
 */
@Injectable()
export class ReputationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReputationService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendingDomains: SendingDomainService,
  ) {}

  onModuleInit(): void {
    if (process.env.REPUTATION_AUTOSUSPEND === "false") {
      this.logger.warn("Automatic suspension disabled by REPUTATION_AUTOSUSPEND=false");
      return;
    }
    const interval = Number(process.env.REPUTATION_INTERVAL_MS ?? 900_000);
    this.timer = setInterval(() => void this.enforce(), interval);
    this.timer.unref();
    this.logger.log("Reputation monitoring active");
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Per-domain reputation over the trailing window. */
  async snapshot(tenantId: string, windowHours = 24): Promise<ReputationSnapshot[]> {
    const since = new Date(Date.now() - windowHours * 3_600_000);

    const domains = await this.prisma.domain.findMany({
      where: { tenantId },
      select: { id: true, name: true, operationalStatus: true },
    });

    const snapshots: ReputationSnapshot[] = [];

    for (const domain of domains) {
      const [sent, bounced, complained] = await Promise.all([
        this.prisma.emailMessage.count({
          where: { domainId: domain.id, createdAt: { gte: since }, status: { in: ["SENT", "DELIVERED", "BOUNCED", "COMPLAINED"] } },
        }),
        this.prisma.emailMessage.count({
          where: { domainId: domain.id, createdAt: { gte: since }, status: "BOUNCED" },
        }),
        this.prisma.emailMessage.count({
          where: { domainId: domain.id, createdAt: { gte: since }, status: "COMPLAINED" },
        }),
      ]);

      const bounceRate = sent ? bounced / sent : 0;
      const complaintRate = sent ? complained / sent : 0;

      snapshots.push({
        domain: domain.name,
        sent,
        bounced,
        complained,
        bounceRate,
        complaintRate,
        operationalStatus: domain.operationalStatus,
        atRisk:
          sent >= MIN_SAMPLE &&
          (bounceRate >= BOUNCE_SUSPEND_RATE / 2 || complaintRate >= COMPLAINT_SUSPEND_RATE / 2),
      });
    }

    return snapshots;
  }

  /**
   * Suspend any domain over threshold. Runs on a timer across all tenants.
   *
   * Suspension is reversible and does not touch DKIM setup — a domain that gets
   * its list in order can be reinstated without redoing verification.
   */
  async enforce(): Promise<number> {
    const since = new Date(Date.now() - 24 * 3_600_000);
    let suspended = 0;

    try {
      const domains = await this.prisma.domain.findMany({
        where: { operationalStatus: "ACTIVE", sendingVerification: "VERIFIED" },
        select: { id: true, name: true, tenantId: true },
      });

      for (const domain of domains) {
        const [sent, bounced, complained] = await Promise.all([
          this.prisma.emailMessage.count({
            where: { domainId: domain.id, createdAt: { gte: since }, status: { in: ["SENT", "DELIVERED", "BOUNCED", "COMPLAINED"] } },
          }),
          this.prisma.emailMessage.count({
            where: { domainId: domain.id, createdAt: { gte: since }, status: "BOUNCED" },
          }),
          this.prisma.emailMessage.count({
            where: { domainId: domain.id, createdAt: { gte: since }, status: "COMPLAINED" },
          }),
        ]);

        if (sent < MIN_SAMPLE) continue;

        const bounceRate = bounced / sent;
        const complaintRate = complained / sent;

        if (bounceRate < BOUNCE_SUSPEND_RATE && complaintRate < COMPLAINT_SUSPEND_RATE) continue;

        const reason =
          bounceRate >= BOUNCE_SUSPEND_RATE
            ? `Suspended automatically: ${(bounceRate * 100).toFixed(1)}% of the last ${sent} messages bounced.`
            : `Suspended automatically: ${(complaintRate * 100).toFixed(2)}% of the last ${sent} messages were marked as spam.`;

        await this.sendingDomains.setOperationalStatus(domain.name, domain.tenantId, "SUSPENDED", reason);
        this.logger.error(`Suspended ${domain.name}: ${reason}`);
        suspended += 1;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown";
      this.logger.error(`Reputation enforcement failed: ${detail}`);
    }

    return suspended;
  }
}
