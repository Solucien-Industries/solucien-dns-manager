import { promises as dns } from "dns";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SesAdminService } from "./ses-admin.service";

export type RecordCheck = {
  type: string;
  name: string;
  expected: string;
  found: string | null;
  status: "VERIFIED" | "PENDING" | "FAILED";
  reason: string | null;
};

/**
 * Story 3: verify a domain's DNS independently and keep pending domains moving
 * without anyone watching a screen.
 *
 * Two checks, deliberately, because they answer different questions:
 *
 *   - Our own resolver lookup tells the customer *which record* is wrong. SES
 *     only ever reports the whole domain as pending, which is useless when five
 *     records are involved and one has a typo.
 *   - SES's own status is what actually gates sending, since AWS will not sign
 *     for a domain it has not confirmed itself.
 *
 * A domain is only promoted to VERIFIED when SES agrees. Our lookup is for
 * diagnosis, not authority — DNS propagation means we can see a record seconds
 * before AWS does, and promoting early would let mail through unsigned.
 */
@Injectable()
export class DomainVerificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainVerificationWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ses: SesAdminService,
  ) {}

  onModuleInit(): void {
    if (process.env.DNS_VERIFICATION_WORKER === "false") {
      this.logger.warn("DNS verification worker disabled");
      return;
    }
    const interval = Number(process.env.DNS_VERIFICATION_INTERVAL_MS ?? 120_000);
    this.timer = setInterval(() => void this.sweep(), interval);
    this.timer.unref();
    this.logger.log("DNS verification worker active");
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Re-check every domain that is still waiting.
   *
   * The `running` flag matters: a slow DNS lookup against dozens of domains can
   * outlast the interval, and overlapping sweeps would hammer both the resolver
   * and the SES API for no benefit.
   */
  async sweep(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      const pending = await this.prisma.domain.findMany({
        where: { sendingVerification: { in: ["PENDING_VERIFICATION", "VERIFYING"] } },
        select: { id: true, name: true, tenantId: true },
        take: 100,
      });

      let verified = 0;
      for (const domain of pending) {
        try {
          const result = await this.verify(domain.id, domain.name);
          if (result) verified += 1;
        } catch (error) {
          const detail = error instanceof Error ? error.message : "unknown";
          this.logger.warn(`Verification failed for ${domain.name}: ${detail}`);
        }
      }

      if (verified) this.logger.log(`Verified ${verified} domain(s)`);
      return verified;
    } finally {
      this.running = false;
    }
  }

  /**
   * Check one domain's records and update its state.
   *
   * Returns true when the domain became sendable on this pass.
   */
  async verify(domainId: string, domainName: string): Promise<boolean> {
    const records = await this.prisma.dnsRecord.findMany({
      where: { domainId, requiredForSending: true },
    });

    // Resolve each expected record and store what we actually saw, so the UI can
    // point at the specific record that is missing or mistyped.
    const checks: RecordCheck[] = [];
    for (const record of records) {
      const check = await this.checkRecord(domainName, record);
      checks.push(check);

      await this.prisma.dnsRecord.update({
        where: { id: record.id },
        data: {
          verificationStatus: check.status,
          lastCheckedAt: new Date(),
          failureCode: check.reason,
        },
      });
    }

    // SES is the authority on whether the domain can actually send.
    const status = await this.ses.getDomainStatus(domainName);
    const sendable = status.verified && status.dkimStatus === "SUCCESS";

    await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        sendingVerification: sendable ? "VERIFIED" : status.dkimStatus === "FAILED" ? "FAILED" : "VERIFYING",
        verificationCheckedAt: new Date(),
        verifiedAt: sendable ? new Date() : null,
        verificationFailureCode: this.failureCode(status.dkimStatus, checks),
      },
    });

    if (sendable) this.logger.log(`${domainName} verified and ready to send`);
    return sendable;
  }

  /** Per-record diagnosis. Public so the API can return it on demand. */
  async describeRecords(domainId: string, domainName: string): Promise<RecordCheck[]> {
    const records = await this.prisma.dnsRecord.findMany({
      where: { domainId, requiredForSending: true },
    });
    return Promise.all(records.map((record: DnsRecordRow) => this.checkRecord(domainName, record)));
  }

  /* ---------------------------------------------------------------------- */

  private async checkRecord(domainName: string, record: DnsRecordRow): Promise<RecordCheck> {
    const fqdn = record.name === "@" ? domainName : `${record.name}.${domainName}`;
    const base = { type: record.type, name: fqdn, expected: record.value };

    try {
      switch (record.type) {
        case "CNAME": {
          const found = await dns.resolveCname(fqdn);
          const match = found.some((value) => this.equalHost(value, record.value));
          return {
            ...base,
            found: found[0] ?? null,
            status: match ? "VERIFIED" : "FAILED",
            reason: match ? null : "CNAME_MISMATCH",
          };
        }
        case "TXT": {
          const found = await dns.resolveTxt(fqdn);
          const flattened = found.map((chunks) => chunks.join(""));
          // SPF and DMARC are matched loosely: a customer's existing SPF record
          // may legitimately contain our include alongside other mechanisms, and
          // demanding an exact string would fail a correctly merged policy.
          const needle = record.value.includes("spf1") ? "include:amazonses.com" : record.value;
          const match = flattened.some((value) => value.includes(needle));
          return {
            ...base,
            found: flattened[0] ?? null,
            status: match ? "VERIFIED" : "FAILED",
            reason: match ? null : "TXT_MISMATCH",
          };
        }
        case "MX": {
          const found = await dns.resolveMx(fqdn);
          const match = found.some((entry) => this.equalHost(entry.exchange, record.value));
          return {
            ...base,
            found: found[0]?.exchange ?? null,
            status: match ? "VERIFIED" : "FAILED",
            reason: match ? null : "MX_MISMATCH",
          };
        }
        default:
          return { ...base, found: null, status: "PENDING", reason: "UNSUPPORTED_TYPE" };
      }
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      // NXDOMAIN and ENODATA mean "not published yet", which is the normal state
      // for a domain the customer is still setting up — not a failure.
      const notYet = code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
      return {
        ...base,
        found: null,
        status: notYet ? "PENDING" : "FAILED",
        reason: notYet ? "NOT_PUBLISHED" : code || "LOOKUP_ERROR",
      };
    }
  }

  private equalHost(a: string, b: string): boolean {
    return a.trim().toLowerCase().replace(/\.$/, "") === b.trim().toLowerCase().replace(/\.$/, "");
  }

  /** A machine-readable reason, as the story's acceptance criteria require. */
  private failureCode(dkimStatus: string, checks: RecordCheck[]): string | null {
    if (dkimStatus === "SUCCESS") return null;
    if (dkimStatus === "FAILED") return "DKIM_FAILED";
    const failed = checks.find((check) => check.status === "FAILED");
    if (failed) return failed.reason;
    const pending = checks.find((check) => check.status === "PENDING");
    if (pending) return "RECORDS_NOT_PUBLISHED";
    return "AWAITING_PROVIDER";
  }
}

type DnsRecordRow = {
  id: string;
  type: string;
  name: string;
  value: string;
};
