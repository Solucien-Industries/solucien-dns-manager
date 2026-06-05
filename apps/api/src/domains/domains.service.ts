import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { seedDomains, SOLUCIEN_NAMESERVERS, type Domain as SharedDomain } from "@solucien/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PowerDnsService } from "../powerdns/powerdns.service";
import { CreateDomainDto } from "./dto/create-domain.dto";

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdns: PowerDnsService,
  ) {}

  /** List domains for a tenant — falls back to seed data when the DB is down. */
  async findAll(tenantId?: string): Promise<SharedDomain[]> {
    if (!this.prisma.connected) return seedDomains;

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
      nameservers: (d.nameservers.length ? d.nameservers : SOLUCIEN_NAMESERVERS) as [string, string],
      records: d._count.records,
      uptime: d.uptime,
      lastSync: d.lastSyncAt ? d.lastSyncAt.toISOString() : "Never",
    }));
  }

  async findOne(name: string): Promise<SharedDomain> {
    const all = await this.findAll();
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
    const tld = dto.tld ?? `.${dto.name.split(".").slice(1).join(".")}`;
    const zone = `${dto.name}.`;

    if (this.pdns.configured) {
      try {
        await this.pdns.createZone(zone, SOLUCIEN_NAMESERVERS);
        this.logger.log(`Provisioned PowerDNS zone ${zone}`);
      } catch (err) {
        this.logger.warn(`PowerDNS zone creation failed for ${zone}: ${(err as Error).message}`);
      }
    }

    if (!this.prisma.connected) {
      return {
        id: `dom_${dto.name}`,
        name: dto.name,
        tld,
        status: "Pending",
        zone,
        owner: dto.owner,
        nameservers: SOLUCIEN_NAMESERVERS,
        records: 0,
        uptime: "Pending",
        lastSync: "Queued",
      };
    }

    const created = await this.prisma.domain.create({
      data: {
        name: dto.name,
        tld,
        zone,
        owner: dto.owner,
        status: "Pending",
        nameservers: [...SOLUCIEN_NAMESERVERS],
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
}
