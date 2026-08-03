import { Injectable, Logger } from "@nestjs/common";
import ipaddr from "ipaddr.js";
import type { ApprovedLocation } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { GeoIpService } from "../common/geoip.service";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { isPrivateIp } from "../common/client-ip";

const RULES_TTL_SECONDS = 60;
const ALERT_DEBOUNCE_SECONDS = 15 * 60;

/**
 * Checks whether an API-key request originates from one of a tenant's approved
 * locations (CIDR ranges and/or ISO country codes). When it doesn't, records a
 * usage event and notifies the tenant's owners/admins (in-app + email), with a
 * Redis debounce so a looping mis-located client can't storm the mailbox.
 *
 * Semantics: a tenant with NO rules has enforcement disabled (everything is
 * approved) so tenants aren't spammed before they opt in.
 */
@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly geoip: GeoIpService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async check(input: {
    tenantId: string;
    keyId: string;
    keyPrefix?: string;
    ip: string | null;
    path?: string;
  }): Promise<{ approved: boolean; country: string | null }> {
    if (!this.prisma.connected) return { approved: true, country: null };

    const rules = await this.loadRules(input.tenantId);
    if (rules.length === 0) return { approved: true, country: null };

    // Don't penalise loopback/private IPs (local dev, health probes).
    if (isPrivateIp(input.ip)) return { approved: true, country: null };

    const geo = this.geoip.lookup(input.ip);
    const country = geo?.country ?? null;
    const approved = this.matches(input.ip, country, rules);

    if (!approved) {
      await this.handleUnapproved({ ...input, country });
    }
    return { approved, country };
  }

  private matches(ip: string | null, country: string | null, rules: ApprovedLocation[]): boolean {
    return rules.some((rule) => {
      if (rule.type === "COUNTRY") {
        return country != null && rule.value.toUpperCase() === country.toUpperCase();
      }
      return ip != null && cidrMatch(ip, rule.value);
    });
  }

  private async handleUnapproved(input: {
    tenantId: string;
    keyId: string;
    keyPrefix?: string;
    ip: string | null;
    path?: string;
    country: string | null;
  }): Promise<void> {
    try {
      await this.prisma.apiKeyUsageEvent.create({
        data: {
          apiKeyId: input.keyId,
          tenantId: input.tenantId,
          ip: input.ip ?? "unknown",
          country: input.country,
          approved: false,
          path: input.path ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to record API-key usage event: ${(err as Error).message}`);
    }

    // Debounce alerts per key+country so a loop doesn't spam owners.
    const debounceKey = `keyloc:${input.keyId}:${input.country ?? input.ip ?? "unknown"}`;
    const alreadyAlerted = await this.redis.get<boolean>(debounceKey);
    if (alreadyAlerted) return;
    await this.redis.set(debounceKey, true, ALERT_DEBOUNCE_SECONDS);

    const recipients = await this.prisma.user.findMany({
      where: { tenantId: input.tenantId, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true, email: true },
    });
    if (recipients.length === 0) return;

    const prefix = input.keyPrefix ?? (await this.keyPrefix(input.keyId));
    const where = input.country ? `${input.country} (${input.ip})` : (input.ip ?? "an unknown location");
    const body = `An API key (${prefix}…) was used from ${where}, outside your approved locations.`;

    await Promise.all(
      recipients.map((user) =>
        this.notifications.create({
          userId: user.id,
          tenantId: input.tenantId,
          kind: "API_KEY_LOCATION",
          title: "Unapproved API key usage",
          body,
        }),
      ),
    );

    void this.mail.sendApiKeyLocationAlert(
      recipients.map((user) => user.email),
      { keyPrefix: prefix, ip: input.ip ?? "unknown", country: input.country },
    );
    this.logger.warn(`Unapproved API-key usage for tenant ${input.tenantId} from ${where}`);
  }

  private async keyPrefix(keyId: string): Promise<string> {
    const key = await this.prisma.apiKey.findUnique({ where: { id: keyId }, select: { prefix: true } });
    return key?.prefix ?? "sdm_";
  }

  private async loadRules(tenantId: string): Promise<ApprovedLocation[]> {
    const cacheKey = `approvedloc:${tenantId}`;
    const cached = await this.redis.get<ApprovedLocation[]>(cacheKey);
    if (cached) return cached;
    const rules = await this.prisma.approvedLocation.findMany({ where: { tenantId } });
    await this.redis.set(cacheKey, rules, RULES_TTL_SECONDS);
    return rules;
  }

  /** Invalidate the cached rules after a tenant edits them. */
  async invalidate(tenantId: string): Promise<void> {
    try {
      await this.redis.client.del(`approvedloc:${tenantId}`);
    } catch {
      /* cache is best-effort */
    }
  }
}

/** True if `ip` falls inside the CIDR range (IPv4 or IPv6). */
function cidrMatch(ip: string, cidr: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    const range = ipaddr.parseCIDR(cidr);
    if (addr.kind() !== range[0].kind()) return false;
    // Kinds are guaranteed equal above; cast past ipaddr's non-unifying overloads.
    return (addr as ipaddr.IPv4).match(range as [ipaddr.IPv4, number]);
  } catch {
    return false;
  }
}
