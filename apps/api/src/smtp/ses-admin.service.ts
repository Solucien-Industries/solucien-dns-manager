import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import {
  CreateConfigurationSetCommand,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityConfigurationSetAttributesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";

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

  private getClient(): SESv2Client {
    if (this.client) return this.client;
    const region = process.env.AWS_REGION ?? process.env.SES_REGION;
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
    return Boolean(process.env.AWS_REGION ?? process.env.SES_REGION);
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
   * Register a customer domain in SES (Easy DKIM), ensure the tenant's
   * configuration set exists, link the identity to it, and return the DKIM
   * CNAME records the customer must publish in their DNS.
   */
  async onboardDomain(domain: string, tenantId: string): Promise<DomainOnboardResult> {
    const client = this.getClient();
    const normalized = domain.trim().toLowerCase().replace(/\.$/, "");
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
        // Already registered — fetch its tokens and make sure it's linked.
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
    return {
      domain: normalized,
      configurationSet,
      dkimRecords: this.toDkimRecords(normalized, tokens),
      status,
    };
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
