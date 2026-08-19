import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { resolveNs } from "dns/promises";
import { seedDomains, NANI_NAMESERVERS, type Domain as SharedDomain } from "@solucien/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PowerDnsService } from "../powerdns/powerdns.service";
import { RecordsService } from "../records/records.service";
import { CreateDomainDto } from "./dto/create-domain.dto";

export type DomainVerification = {
  domain: string;
  state: "pending" | "propagating" | "verified";
  verified: boolean;
  expectedNameservers: string[];
  detectedNameservers: string[];
  matchedNameservers: string[];
  message: string;
  checkedAt: string;
};

function normalizeNs(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);
  private readonly ephemeralDomains = new Map<string, SharedDomain>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdns: PowerDnsService,
    private readonly records: RecordsService,
  ) {}

  /** List domains for a tenant — falls back to seed data when the DB is down. */
  async findAll(tenantId?: string): Promise<SharedDomain[]> {
    if (!this.prisma.connected) {
      const created = [...this.ephemeralDomains.values()];
      const createdNames = new Set(created.map((domain) => domain.name));
      return [...seedDomains.filter((domain) => !createdNames.has(domain.name)), ...created];
    }

    const rows = await this.prisma.domain.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { _count: { select: { records: true } } },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      tld: d.tld,
      status: d.status,
      zone: d.zone,
      owner: d.owner,
      nameservers: (d.nameservers.length ? d.nameservers : NANI_NAMESERVERS) as [string, string],
      records: d._count.records,
      uptime: d.uptime,
      lastSync: d.lastSyncAt ? d.lastSyncAt.toISOString() : "Never",
    }));
  }

  async findOne(name: string, tenantId?: string): Promise<SharedDomain> {
    const all = await this.findAll(tenantId);
    const found = all.find((d) => d.name === name);
    if (!found) throw new NotFoundException(`Domain ${name} not found`);
    return found;
  }

  /**
   * Create a domain: persist to Postgres and provision the PowerDNS zone.
   * PowerDNS provisioning is best-effort so a missing DNS backend doesn't block
   * the record being created in the control plane.
   */
  async create(dto: CreateDomainDto, tenantId: string): Promise<SharedDomain> {
    const name = dto.name.trim().toLowerCase();
    const tld = dto.tld ?? `.${name.split(".").slice(1).join(".")}`;
    const zone = `${name}.`;

    if (this.pdns.configured) {
      try {
        await this.pdns.createZone(zone, NANI_NAMESERVERS);
        this.logger.log(`Provisioned PowerDNS zone ${zone}`);
      } catch (err) {
        this.logger.warn(`PowerDNS zone creation failed for ${zone}: ${(err as Error).message}`);
      }
    }

    if (!this.prisma.connected) {
      const domain: SharedDomain = {
        id: `dom_${name}`,
        name,
        tld,
        status: "Pending",
        zone,
        owner: dto.owner,
        nameservers: NANI_NAMESERVERS,
        records: 0,
        uptime: "Pending",
        lastSync: "Queued",
      };
      this.ephemeralDomains.set(name, domain);
      return domain;
    }

    const created = await this.prisma.domain.create({
      data: {
        name,
        tld,
        zone,
        owner: dto.owner,
        status: "Pending",
        nameservers: [...NANI_NAMESERVERS],
        tenantId,
      },
    });

    return {
      id: created.id,
      name: created.name,
      tld: created.tld,
      status: created.status,
      zone: created.zone,
      owner: created.owner,
      nameservers: created.nameservers as [string, string],
      records: 0,
      uptime: created.uptime,
      lastSync: "Queued",
    };
  }

  async verifyDelegation(name: string, tenantId: string): Promise<DomainVerification> {
    const domainName = name.trim().toLowerCase();
    await this.findOne(domainName, tenantId);

    const expected = NANI_NAMESERVERS.map(normalizeNs);
    let detected: string[] = [];

    try {
      detected = (await resolveNs(domainName)).map(normalizeNs);
    } catch {
      detected = [];
    }

    const matched = expected.filter((ns) => detected.includes(ns));
    const verified = matched.length === expected.length;
    const state = verified ? "verified" : matched.length > 0 ? "propagating" : "pending";

    if (verified) {
      await this.markDomainActive(domainName, tenantId);
    }

    const message = verified
      ? "Nameserver delegation verified. Zone is active."
      : matched.length > 0
        ? `Partial delegation detected (${matched.length}/${expected.length} nameservers). Propagation may still be in progress.`
        : detected.length > 0
          ? `Registrar still points to ${detected.slice(0, 2).join(", ")}. Update to Nani nameservers.`
          : "Waiting for nameserver delegation at your registrar.";

    return {
      domain: domainName,
      state,
      verified,
      expectedNameservers: [...NANI_NAMESERVERS],
      detectedNameservers: detected,
      matchedNameservers: matched,
      message,
      checkedAt: new Date().toISOString(),
    };
  }

  async exportZone(name: string, tenantId: string): Promise<{ domain: string; format: "bind"; content: string }> {
    const domain = await this.findOne(name, tenantId);
    const records = await this.records.findAll(domain.name);
    const lines = [
      `; Zone export for ${domain.name}`,
      `; Generated ${new Date().toISOString()}`,
      `$ORIGIN ${domain.zone}`,
      `$TTL 3600`,
      ...records.map((record) => {
        const owner = record.name === "@" ? domain.zone : `${record.name}.${domain.name}.`;
        const priority = record.priority != null ? ` ${record.priority}` : "";
        return `${owner} ${record.ttl} IN ${record.type}${priority} ${record.value}`;
      }),
    ];

    return { domain: domain.name, format: "bind", content: lines.join("\n") };
  }

  private async markDomainActive(name: string, tenantId: string): Promise<void> {
    const ephemeral = this.ephemeralDomains.get(name);
    if (ephemeral) {
      this.ephemeralDomains.set(name, {
        ...ephemeral,
        status: "Active",
        uptime: "99.99%",
        lastSync: "Just now",
      });
    }

    if (this.prisma.connected) {
      await this.prisma.domain.updateMany({
        where: { name, tenantId },
        data: { status: "Active", uptime: "99.99%", lastSyncAt: new Date() },
      });
    }
  }
}
