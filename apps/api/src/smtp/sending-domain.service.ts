import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecordsService } from "../records/records.service";
import { SesAdminService } from "./ses-admin.service";

export type SendingDnsRecord = {
  type: "CNAME" | "TXT" | "MX";
  name: string;
  value: string;
  purpose: "DKIM" | "SPF" | "DMARC";
  /** True when we wrote it into a zone we host; false when the customer must publish it. */
  published: boolean;
};

export type SendingDomainView = {
  domain: string;
  /** True when Nani's nameservers actually answer for this domain. */
  dnsHostedHere: boolean;
  sendingVerification: string;
  operationalStatus: string;
  canSend: boolean;
  verifiedAt: string | null;
  checkedAt: string | null;
  records: SendingDnsRecord[];
  message: string;
};

/**
 * Stories 1–3: register a domain for sending, get its DKIM records in place, and
 * track verification through to "can send".
 *
 * Two things this deliberately separates, because conflating them is the most
 * common way a mail platform ends up unusable:
 *
 *   1. Hosting a domain's DNS with Nani.
 *   2. Sending email as that domain.
 *
 * They are independent. A customer can host their zone here and never send
 * mail, and — far more commonly — can want to send as a domain whose DNS lives
 * at Cloudflare, Route 53 or their registrar. Requiring (1) before (2) would
 * shut out most customers, including Solucien's own domains.
 *
 * So a domain that is not in the DNS system at all is registered as email-only:
 * no PowerDNS zone is provisioned, and the DKIM records are handed back for the
 * customer to publish wherever their DNS actually lives. Where Nani *does* host
 * the zone, the records are written automatically — one click instead of five
 * copy-pastes, which is the real advantage of owning both halves.
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
   * Register a domain for sending and get its DKIM records in place.
   *
   * Creates the domain record if this workspace has never seen it — that is the
   * email-only path, and it is what makes sending as an externally-hosted
   * domain possible without first moving the customer's DNS.
   *
   * Idempotent: running it again re-fetches the tokens from SES and re-writes
   * any records we own, which is what you want after a record is deleted by
   * accident or a first attempt half-completed.
   */
  async enableSending(domainName: string, tenantId: string): Promise<SendingDomainView> {
    const normalized = this.normalize(domainName);
    if (!this.looksLikeDomain(normalized)) {
      throw new BadRequestException(`"${domainName}" is not a valid domain name.`);
    }

    const existing = await this.prisma.domain.findUnique({ where: { name: normalized } });

    // Cross-workspace use and "never seen" get the same reply on purpose:
    // telling a stranger that a domain is already registered to someone else
    // leaks customer information.
    if (existing && existing.tenantId !== tenantId) {
      throw new NotFoundException(`Domain ${normalized} is not in this workspace.`);
    }

    const domain = existing ?? (await this.createEmailOnlyDomain(normalized, tenantId));

    // Registers the identity, links it to the tenant's configuration set for
    // per-tenant reputation tracking, and returns the records that prove
    // ownership.
    const onboarded = await this.ses.onboardDomain(normalized, tenantId);

    const wanted: WantedRecord[] = [
      ...onboarded.dkimRecords.map((dkim) => ({
        type: "CNAME" as const,
        name: this.relativeName(dkim.name, normalized),
        value: dkim.value,
        purpose: "DKIM" as const,
      })),
      // dnsGuidance.spf is prose written for a human. SPF also permits only one
      // policy per domain, so publishing ours blindly would break a domain that
      // already sends mail elsewhere — give the mechanism and let them merge it.
      { type: "TXT", name: "@", value: "v=spf1 include:amazonses.com ~all", purpose: "SPF" },
      { type: "TXT", name: "_dmarc", value: onboarded.dnsGuidance.dmarc.suggestedValue, purpose: "DMARC" },
    ];

    // Whether we can publish depends on whether Nani's nameservers actually
    // answer for this domain. Writing into our copy of a zone the registrar
    // does not delegate to us would change nothing the world can see.
    const published: SendingDnsRecord[] = this.hostsDns(domain)
      ? await Promise.all(wanted.map((record) => this.publish(normalized, record)))
      : wanted.map((record) => ({ ...record, published: false }));

    const updated = await this.prisma.domain.update({
      where: { id: domain.id },
      data: {
        sendingVerification: "VERIFYING",
        verificationCheckedAt: new Date(),
        verificationFailureCode: null,
      },
    });

    this.logger.log(
      `Enabled sending for ${normalized} (${this.hostsDns(domain) ? "records published" : "customer publishes"})`,
    );

    // Verification is never instant, so report VERIFYING and let the caller poll
    // rather than pretending the domain is ready.
    return this.refreshVerification(normalized, tenantId, published);
  }

  /**
   * Ask SES whether the records have been seen, and promote the domain to
   * VERIFIED when they have. Safe to call on a timer or from the UI.
   */
  async refreshVerification(
    domainName: string,
    tenantId: string,
    knownRecords?: SendingDnsRecord[],
  ): Promise<SendingDomainView> {
    const normalized = this.normalize(domainName);
    const domain = await this.requireOwnedDomain(normalized, tenantId);

    const status = await this.ses.getDomainStatus(normalized);
    const verified = status.verified && status.dkimStatus === "SUCCESS";

    const updated = await this.prisma.domain.update({
      where: { id: domain.id },
      data: {
        sendingVerification: verified ? "VERIFIED" : status.dkimStatus === "FAILED" ? "FAILED" : "VERIFYING",
        verificationCheckedAt: new Date(),
        verifiedAt: verified ? (domain.verifiedAt ?? new Date()) : null,
        verificationFailureCode: status.dkimStatus === "FAILED" ? "DKIM_FAILED" : null,
      },
    });

    // Mirror the outcome onto the individual records so the UI can show which
    // part of the setup is lagging instead of one opaque "pending".
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
        published: this.hostsDns(domain),
      }));

    return this.toView(updated, records);
  }

  /** Stop or resume a domain's sending without touching its DKIM setup. */
  async setOperationalStatus(
    domainName: string,
    tenantId: string,
    status: "ACTIVE" | "SUSPENDED" | "DISABLED",
    reason?: string,
  ): Promise<SendingDomainView> {
    const normalized = this.normalize(domainName);
    const domain = await this.requireOwnedDomain(normalized, tenantId);

    const updated = await this.prisma.domain.update({
      where: { id: domain.id },
      data: { operationalStatus: status, suspensionReason: reason ?? null },
    });

    return this.toView(updated, []);
  }

  /* ---------------------------------------------------------------------- */

  /**
   * A domain the customer wants to send as, but whose DNS lives elsewhere.
   *
   * No PowerDNS zone is provisioned: we are not authoritative for it and
   * pretending otherwise would put a zone in our nameservers that never gets
   * queried. `status` stays at its default so nothing in the DNS side treats
   * this as a hosted zone.
   */
  private async createEmailOnlyDomain(name: string, tenantId: string): Promise<DomainRow> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    this.logger.log(`Registering ${name} as an email-only domain (DNS hosted elsewhere)`);

    return this.prisma.domain.create({
      data: {
        name,
        tld: name.split(".").slice(1).join(".") || "com",
        zone: `${name}.`,
        owner: tenant?.name ?? "Unknown",
        tenantId,
        sendingVerification: "PENDING_VERIFICATION",
        operationalStatus: "ACTIVE",
        returnPathHost: `bounce.${name}`,
      },
    });
  }

  private async requireOwnedDomain(name: string, tenantId: string): Promise<DomainRow> {
    const domain = await this.prisma.domain.findUnique({ where: { name } });
    if (!domain || domain.tenantId !== tenantId) {
      throw new NotFoundException(`Domain ${name} is not in this workspace.`);
    }
    return domain;
  }

  /** True only when the registrar delegates to Nani, so our zone is the live one. */
  private hostsDns(domain: DomainRow): boolean {
    return domain.status === "Active";
  }

  /**
   * Write one record into a zone we host, and flag it as required for sending
   * so a later cleanup never removes it by accident.
   */
  private async publish(domainName: string, record: WantedRecord): Promise<SendingDnsRecord> {
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
      // One failed record should not abort the rest — the customer can retry,
      // and a partial set is still visible progress.
      const detail = error instanceof Error ? error.message : "unknown";
      this.logger.warn(`Could not publish ${record.purpose} record for ${domainName}: ${detail}`);
      return { ...record, published: false };
    }
  }

  private normalize(domain: string): string {
    return domain.trim().toLowerCase().replace(/\.$/, "");
  }

  private looksLikeDomain(domain: string): boolean {
    return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(domain) && domain.length <= 253;
  }

  /** PowerDNS stores names relative to the zone; SES returns them absolute. */
  private relativeName(fqdn: string, domain: string): string {
    const suffix = `.${domain}`;
    return fqdn.endsWith(suffix) ? fqdn.slice(0, -suffix.length) : fqdn;
  }

  private toView(domain: DomainRow, records: SendingDnsRecord[]): SendingDomainView {
    const canSend = domain.sendingVerification === "VERIFIED" && domain.operationalStatus === "ACTIVE";

    return {
      domain: domain.name,
      dnsHostedHere: this.hostsDns(domain),
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
        return this.hostsDns(domain)
          ? "Records added to your zone. Waiting for AWS to confirm — usually a few minutes."
          : "Add the records below at your DNS provider, then check again.";
      case "FAILED":
        return "Verification failed. Re-run setup to regenerate the records.";
      default:
        return "Email sending is not set up for this domain yet.";
    }
  }
}

type WantedRecord = {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  purpose: "DKIM" | "SPF" | "DMARC";
};

/** Shape we rely on from the Domain row — kept local so the service reads clearly. */
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
