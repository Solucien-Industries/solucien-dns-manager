import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import {
  CreateConfigurationSetCommand,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityConfigurationSetAttributesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { PrismaService } from "../prisma/prisma.service";
import { parseSenderDomain, senderDomainRejection } from "./sender-authorization";

export type DkimRecord = {
  name: string;
  type: "CNAME";
  value: string;
};

export type DomainOnboardResult = {
  domain: string;
  configurationSet: string;
  dkimRecords: DkimRecord[];
  status: DomainStatus;
  dnsGuidance: {
    spf: string;
    dmarc: { name: string; type: "TXT"; suggestedValue: string };
    customMailFrom: string;
  };
};

export type DomainStatus = {
  domain: string;
  verified: boolean;
  dkimStatus: string;
  dkimRecords: DkimRecord[];
};

/**
 * Manages per-customer email domains in AWS SES so many tenants can send from
 * their own verified domains under one shared SES account.
 *
 * Reputation isolation: each tenant gets its own SES *configuration set*, and
 * the tenant's domain identity is linked to it. SES then tracks bounces,
 * complaints and reputation per tenant rather than lumping everyone together,
 * so one bad sender doesn't sink deliverability for the rest. Because the
 * config set is attached at the identity level, sends (including over SMTP)
 * are attributed automatically with no change to the send path.
 *
 * Credentials come from the standard AWS env chain (AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY, or an IAM role). Only AWS_REGION is required here.
 */
@Injectable()
export class SesAdminService {
  private readonly logger = new Logger(SesAdminService.name);
  private client: SESv2Client | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private getClient(): SESv2Client {
    if (this.client) return this.client;
    const region = process.env.AWS_REGION?.trim() || process.env.SES_REGION?.trim();
    if (!region) {
      throw new ServiceUnavailableException(
        "SES admin is not configured. Set AWS_REGION (and AWS credentials).",
      );
    }
    this.client = new SESv2Client({ region });
    this.logger.log(`SES admin client ready (${region})`);
    return this.client;
  }

  isConfigured(): boolean {
    return Boolean(process.env.AWS_REGION?.trim() || process.env.SES_REGION?.trim());
  }

  /** Config set name is deterministic per tenant so it's easy to find and reuse. */
  private configSetName(tenantId: string): string {
    return `tenant-${tenantId}`;
  }

  private toDkimRecords(domain: string, tokens: string[]): DkimRecord[] {
    return tokens.map((token) => ({
      name: `${token}._domainkey.${domain}`,
      type: "CNAME" as const,
      value: `${token}.dkim.amazonses.com`,
    }));
  }

  /**
   * Register a customer domain in SES (Easy DKIM), ensure the tenants
   * configuration set exists, link the identity to it, and return the DKIM
   * CNAME records the customer must publish in their DNS.
   */
  async onboardDomain(domain: string, tenantId: string): Promise<DomainOnboardResult> {
    const client = this.getClient();
    const normalized = domain.trim().toLowerCase().replace(/\.$/, "");
    if (!this.prisma.connected) throw new ServiceUnavailableException("SMTP domain onboarding requires PostgreSQL.");
    const owned = await this.prisma.domain.findUnique({ where: { name: normalized } });
    if (!owned || owned.tenantId !== tenantId) throw new ForbiddenException("Register this domain in your workspace before SMTP onboarding.");
    const configurationSet = this.configSetName(tenantId);

    await this.ensureConfigurationSet(configurationSet);

    let tokens: string[] = [];
    try {
      const created = await client.send(
        new CreateEmailIdentityCommand({
          EmailIdentity: normalized,
          ConfigurationSetName: configurationSet,
        }),
      );
      tokens = created.DkimAttributes?.Tokens ?? [];
      this.logger.log(`Created SES identity for ${normalized}`);
    } catch (error) {
      if (this.errorName(error) === "AlreadyExistsException") {
        // Already registered — fetch its tokens and make sure its limked
        const existing = await client.send(new GetEmailIdentityCommand({ EmailIdentity: normalized }));
        tokens = existing.DkimAttributes?.Tokens ?? [];
        await client.send(
          new PutEmailIdentityConfigurationSetAttributesCommand({
            EmailIdentity: normalized,
            ConfigurationSetName: configurationSet,
          }),
        );
        this.logger.log(`Re-linked existing SES identity ${normalized} to ${configurationSet}`);
      } else {
        throw new ServiceUnavailableException(
          `SES domain onboarding failed: ${this.errorMessage(error)}`,
        );
      }
    }

    const status = await this.getDomainStatus(normalized);
    const records = this.toDkimRecords(normalized, tokens);
    await this.prisma.$transaction([
      this.prisma.domain.update({ where: { id: owned.id }, data: { sendingVerification: status.verified ? "VERIFIED" : "PENDING_VERIFICATION", verificationCheckedAt: new Date(), verificationFailureCode: status.verified ? null : `SES_${status.dkimStatus}`, verifiedAt: status.verified ? new Date() : null } }),
      ...records.map((record) => this.prisma.dnsRecord.upsert({
        where: { id: `ses-dkim-${owned.id}-${record.name.split(".")[0]}` },
        create: { id: `ses-dkim-${owned.id}-${record.name.split(".")[0]}`, domainId: owned.id, type: "CNAME", name: record.name, value: record.value, requiredForSending: true, verificationStatus: status.verified ? "VERIFIED" : "PENDING", lastCheckedAt: new Date() },
        update: { value: record.value, requiredForSending: true, verificationStatus: status.verified ? "VERIFIED" : "PENDING", lastCheckedAt: new Date(), failureCode: status.verified ? null : `SES_${status.dkimStatus}` },
      })),
    ]);
    return {
      domain: normalized,
      configurationSet,
      dkimRecords: records,
      status,
      dnsGuidance: {
        spf: "Publish only one SPF policy. Merge include:amazonses.com into an existing SPF record; create v=spf1 include:amazonses.com ~all only when no SPF record exists.",
        dmarc: { name: `_dmarc.${normalized}`, type: "TXT", suggestedValue: "v=DMARC1; p=none; rua=mailto:dmarc@YOUR-REPORTING-DOMAIN" },
        customMailFrom: "Custom MAIL FROM/return-path is not automated. Configure a dedicated SES MAIL FROM subdomain and publish the exact SES-provided MX and SPF records.",
      },
    };
  }

  async verifyOwnedDomain(domain: string, tenantId: string): Promise<DomainStatus> {
    const normalized = domain.trim().toLowerCase().replace(/\.$/, "");
    if (!this.prisma.connected) throw new ServiceUnavailableException("SMTP verification requires PostgreSQL.");
    const owned = await this.prisma.domain.findFirst({ where: { name: normalized, tenantId } });
    if (!owned) throw new ForbiddenException("Domain is not owned by this workspace.");
    await this.prisma.domain.update({ where: { id: owned.id }, data: { sendingVerification: "VERIFYING", verificationFailureCode: null } });
    try {
      const status = await this.getDomainStatus(normalized);
      await this.prisma.$transaction([
        this.prisma.domain.update({ where: { id: owned.id }, data: { sendingVerification: status.verified ? "VERIFIED" : "PENDING_VERIFICATION", verificationCheckedAt: new Date(), verificationFailureCode: status.verified ? null : `SES_${status.dkimStatus}`, verifiedAt: status.verified ? new Date() : null } }),
        this.prisma.dnsRecord.updateMany({ where: { domainId: owned.id, requiredForSending: true }, data: { verificationStatus: status.verified ? "VERIFIED" : "PENDING", lastCheckedAt: new Date(), failureCode: status.verified ? null : `SES_${status.dkimStatus}` } }),
      ]);
      return status;
    } catch (error) {
      await this.prisma.domain.update({ where: { id: owned.id }, data: { sendingVerification: "FAILED", verificationCheckedAt: new Date(), verificationFailureCode: "SES_LOOKUP_FAILED" } });
      throw error;
    }
  }

  async assertSenderDomainAllowed(fromEmail: string, tenantId: string, credentialId?: string) {
    const domainName = parseSenderDomain(fromEmail);
    if (!domainName) throw new ForbiddenException("Sender address is invalid.");
    if (!this.prisma.connected) throw new ServiceUnavailableException("Sender authorisation requires PostgreSQL.");
    const domain = await this.prisma.domain.findUnique({ where: { name: domainName } });
    const rejection = senderDomainRejection(domain, tenantId);
    if (rejection) throw new ForbiddenException(rejection);
    if (!domain) throw new ForbiddenException("Sender domain is not authorised.");
    if (credentialId) {
      const credential = await this.prisma.smtpCredential.findFirst({ where: { id: credentialId, tenantId, status: "ACTIVE", OR: [{ domainId: null }, { domainId: domain.id }] } });
      if (!credential) throw new ForbiddenException("SMTP credential is revoked, disabled, or outside its domain scope.");
    }
    return domain;
  }

  /** Current verification + DKIM status for a domain identity. */
  async getDomainStatus(domain: string): Promise<DomainStatus> {
    const client = this.getClient();
    const normalized = domain.trim().toLowerCase().replace(/\.$/, "");

    try {
      const res = await client.send(new GetEmailIdentityCommand({ EmailIdentity: normalized }));
      const tokens = res.DkimAttributes?.Tokens ?? [];
      return {
        domain: normalized,
        verified: Boolean(res.VerifiedForSendingStatus),
        dkimStatus: res.DkimAttributes?.Status ?? "NOT_STARTED",
        dkimRecords: this.toDkimRecords(normalized, tokens),
      };
    } catch (error) {
      if (this.errorName(error) === "NotFoundException") {
        return { domain: normalized, verified: false, dkimStatus: "NOT_STARTED", dkimRecords: [] };
      }
      throw new ServiceUnavailableException(`SES status check failed: ${this.errorMessage(error)}`);
    }
  }

  private async ensureConfigurationSet(name: string): Promise<void> {
    const client = this.getClient();
    try {
      await client.send(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: name,
          // Track bounce/complaint/reputation metrics for this tenant.
          ReputationOptions: { ReputationMetricsEnabled: true },
        }),
      );
      this.logger.log(`Created configuration set ${name}`);
    } catch (error) {
      if (this.errorName(error) === "AlreadyExistsException") return;
      throw new ServiceUnavailableException(
        `Failed to create configuration set ${name}: ${this.errorMessage(error)}`,
      );
    }
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : "";
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown SES error";
  }

 
  

}
