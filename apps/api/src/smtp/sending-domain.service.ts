import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecordsService } from "../records/records.service";
import { SesAdminService } from "./ses-admin.service";

export type SendingDnsRecord = {
  type: "CNAME" | "TXT" | "MX";
  name: string;
  value: string;
  purpose: "DKIM" | "SPF" | "DMARC";
  published: boolean;
};

export type SendingDomainView = {
  domain: string;
  delegated: boolean;
  sendingVerification: string;
  operationalStatus: string;
  canSend: boolean;
  verifiedAt: string | null;
  checkedAt: string | null;
  records: SendingDnsRecord[];
  message: string;
};

/**
 * Stories 1–3: register a customer domain for sending, publish the DNS records
 * that prove ownership, and track verification through to "can send".
 *
 * The shortcut this platform has over a plain relay: Nani *is* the customer's
 * DNS host once they delegate their nameservers, so the DKIM, SPF and DMARC
 * records can be written into their zone directly instead of being handed over
 * as copy-paste instructions. That turns a multi-day back-and-forth into one
 * click, and removes the most common source of setup failure — a mistyped
 * record.
 *
 * The delegation check is the gate. Writing records into a zone the registrar
 * does not point at would verify nothing, so onboarding refuses until the
 * domain's nameservers actually resolve to Nani.
 */
@Injectable()
export class SendingDomainService {
  private readonly logger = new Logger(SendingDomainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ses: SesAdminService,
    private readonly records: RecordsService,
  ) {}

  /** Domains in this workspace, with their sending state. */
  async list(tenantId: string): Promise<SendingDomainView[]> {
    const domains = await this.prisma.domain.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });

    return domains.map((domain: DomainRow) => this.toView(domain, []));
  }

  /**
   * Story 1–2: register the domain in SES and publish its DKIM records.
   *
   * Idempotent — running it again re-fetches the tokens from SES and re-writes
   * the records, which is what you want when a customer deletes a record by
   * accident or the first attempt half-completed.
   */
  async enableSending(domainName: string, tenantId: string): Promise<SendingDomainView> {
    const normalized = domainName.trim().toLowerCase().replace(/\.$/, "");
    const domain = await this.requireOwnedDomain(normalized, tenantId);

    // Registers the identity, links it to the tenant's configuration set for
    // per-tenant reputation, and returns the records that prove ownership.
    const onboarded = await this.ses.onboardDomain(normalized, tenantId);

    // Two paths, decided by who actually answers DNS queries for this domain.
    // When the registrar delegates to Nani we own the zone and can publish the
    // records ourselves — one click, no transcription errors. When it points
    // somewhere else (Cloudflare, Route 53, a registrar's own DNS) writing into
    // our copy of the zone would change nothing the world can see, so we hand
    // the records back for the customer to publish there.
    const weHostDns = domain.status === "Active";

    const wanted: Array<{ type: "CNAME" | "TXT"; name: string; value: string; purpose: "DKIM" | "SPF" | "DMARC" }> = [
      ...onboarded.dkimRecords.map((dkim) => ({
        type: "CNAME" as const,
        name: this.relativeName(dkim.name, normalized),
        value: dkim.value,
        purpose: "DKIM" as const,
      })),
      // dnsGuidance.spf is advice for a human, not a record value. SPF also
      // allows only one policy per domain, so blindly adding ours would break a
      // domain that already sends mail elsewhere — publish the mechanism and
      // let the customer merge it.
      { type: "TXT", name: "@", value: "v=spf1 include:amazonses.com ~all", purpose: "SPF" },      
      { type: "TXT", name: "_dmarc", value: onboarded.dnsGuidance.dmarc.suggestedValue, purpose: "DMARC" },
    ];

    const published: SendingDnsRecord[] = weHostDns
      ? await Promise.all(wanted.map((record) => this.publish(normalized, record)))
      : wanted.map((record) => ({ ...record, published: false }));

    await this.prisma.domain.update({
      where: { id: domain.id },
      data: {
        sendingVerification: "VERIFYING",
        verificationCheckedAt: new Date(),
        verificationFailureCode: null,
      },
    });

    this.logger.log(`Enabled sending for ${normalized}: published ${published.length} records`);

    // DKIM propagation is not instant even in our own zone, so report VERIFYING
    // and let the caller poll rather than pretending it is ready.
    return this.refreshVerification(normalized, tenantId, published);
  }

  /**
   * Story 3: ask SES whether the published records have been seen, and promote
   * the domain to VERIFIED when they have.
   *
   * Safe to call on a timer or from the UI — it is a read against SES plus at
   * most one status write.
   */
  async refreshVerification(
    domainName: string,
    tenantId: string,
    knownRecords?: SendingDnsRecord[],
  ): Promise<SendingDomainView> {
    const normalized = domainName.trim().toLowerCase().replace(/\.$/, "");
    const domain = await this.requireOwnedDomain(normalized, tenantId);

    const status = await this.ses.getDomainStatus(normalized);
    const verified = status.verified && status.dkimStatus === "SUCCESS";

    const updated = await this.prisma.domain.update({
      where: { id: domain.id },
      data: {
        sendingVerification: verified
          ? "VERIFIED"
          : status.dkimStatus === "FAILED"
            ? "FAILED"
            : "VERIFYING",
        verificationCheckedAt: new Date(),
        verifiedAt: verified ? (domain.verifiedAt ?? new Date()) : null,
        verificationFailureCode: status.dkimStatus === "FAILED" ? "DKIM_FAILED" : null,
      },
    });

    // Mirror the outcome onto the individual records so the UI can show which
    // part of the setup is lagging rather than a single opaque "pending".
    await this.prisma.dnsRecord.updateMany({
      where: { domainId: domain.id, requiredForSending: true },
      data: {
        verificationStatus: verified ? "VERIFIED" : status.dkimStatus === "FAILED" ? "FAILED" : "PENDING",
        lastCheckedAt: new Date(),
      },
    });

    const records =
      knownRecords ??
      status.dkimRecords.map((r) => ({
        type: "CNAME" as const,
        name: r.name,
        value: r.value,
        purpose: "DKIM" as const,
        published: true,
      }));

    return this.toView(updated, records);
  }

  /** Stop a domain sending without deleting it — story 12's suspend hook. */
  async setOperationalStatus(
    domainName: string,
    tenantId: string,
    status: "ACTIVE" | "SUSPENDED" | "DISABLED",
    reason?: string,
  ): Promise<SendingDomainView> {
    const normalized = domainName.trim().toLowerCase();
    const domain = await this.requireOwnedDomain(normalized, tenantId);

    const updated = await this.prisma.domain.update({
      where: { id: domain.id },
      data: { operationalStatus: status, suspensionReason: reason ?? null },
    });

    return this.toView(updated, []);
  }

  /* ---------------------------------------------------------------------- */

  private async requireOwnedDomain(name: string, tenantId: string): Promise<DomainRow> {
    const domain = await this.prisma.domain.findUnique({ where: { name } });
    // Same reply for "not ours" and "does not exist": telling a stranger which
    // domains exist on the platform leaks customer information.
    if (!domain || domain.tenantId !== tenantId) {
      throw new NotFoundException(`Domain ${name} is not in this workspace.`);
    }
    return domain;
  }

  /**
   * Write one record into the customer's zone and flag it as required for
   * sending, so a later cleanup never removes it by accident.
   */
  private async publish(
    domainName: string,
    record: { type: "CNAME" | "TXT"; name: string; value: string; purpose: "DKIM" | "SPF" | "DMARC" },
  ): Promise<SendingDnsRecord> {
    try {
      const created = await this.records.create({
        domain: domainName,
        type: record.type,
        name: record.name,
        value: record.value,
        ttl: 1800,
      });

      await this.prisma.dnsRecord.updateMany({
        where: { id: created.id },
        data: { requiredForSending: true, verificationStatus: "PENDING" },
      });

      return { ...record, published: true };
    } catch (error) {
      // One failed record should not abort the rest: the customer can retry, and
      // a partially published set is still progress they can see.
      const detail = error instanceof Error ? error.message : "unknown";
      this.logger.warn(`Could not publish ${record.purpose} record for ${domainName}: ${detail}`);
      return { ...record, published: false };
    }
  }

  /** PowerDNS stores names relative to the zone; SES returns them absolute. */
  private relativeName(fqdn: string, domain: string): string {
    const suffix = `.${domain}`;
    return fqdn.endsWith(suffix) ? fqdn.slice(0, -suffix.length) : fqdn;
  }

  private toView(domain: DomainRow, records: SendingDnsRecord[]): SendingDomainView {
    const canSend =
      domain.sendingVerification === "VERIFIED" && domain.operationalStatus === "ACTIVE";

    return {
      domain: domain.name,
      delegated: domain.status === "Active",
      sendingVerification: domain.sendingVerification,
      operationalStatus: domain.operationalStatus,
      canSend,
      verifiedAt: domain.verifiedAt ? domain.verifiedAt.toISOString() : null,
      checkedAt: domain.verificationCheckedAt ? domain.verificationCheckedAt.toISOString() : null,
      records,
      message: this.describe(domain, canSend),
    };
  }

  private describe(domain: DomainRow, canSend: boolean): string {
    if (canSend) return "Verified. This domain can send email.";
    if (domain.operationalStatus !== "ACTIVE") {
      return domain.suspensionReason ?? `Sending is ${domain.operationalStatus.toLowerCase()} for this domain.`;
    }
    
    switch (domain.sendingVerification) {
      case "VERIFYING":
        return domain.status === "Active"
          ? "Records added to your zone. Waiting for AWS to confirm — usually a few minutes."
          : "Add the records below at your DNS provider, then check again.";
      case "FAILED":
        return "DKIM verification failed. Re-run setup to republish the records.";
      default:
        return domain.status === "Active"
          ? "Email is not set up for this domain yet."
          : "Email is not set up yet. DNS for this domain is hosted elsewhere, so you will add the records at your provider.";    }
  }
}

/** Shape we rely on from the Domain row — kept local so the service is readable. */
type DomainRow = {
  id: string;
  name: string;
  status: string;
  tenantId: string;
  sendingVerification: string;
  operationalStatus: string;
  suspensionReason: string | null;
  verifiedAt: Date | null;
  verificationCheckedAt: Date | null;
};
