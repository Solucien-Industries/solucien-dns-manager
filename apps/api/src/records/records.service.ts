import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { seedRecords, type DnsRecord as SharedRecord } from "@solucien/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PowerDnsService } from "../powerdns/powerdns.service";
import { CreateRecordDto } from "./dto/create-record.dto";

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdns: PowerDnsService,
  ) {}

  async findAll(domainName?: string): Promise<SharedRecord[]> {
    if (!this.prisma.connected) {
      return domainName ? seedRecords.filter((r) => r.domain === domainName) : seedRecords;
    }

    const rows = await this.prisma.dnsRecord.findMany({
      where: domainName ? { domain: { name: domainName } } : undefined,
      include: { domain: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return rows.map((r) => ({
      id: r.id,
      domain: r.domain.name,
      type: r.type,
      name: r.name,
      value: r.value,
      ttl: r.ttl,
      priority: r.priority ?? undefined,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /** Create a record in Postgres and push it to PowerDNS (best-effort). */
  async create(dto: CreateRecordDto): Promise<SharedRecord> {
    this.validateEmailDnsRecord(dto);

    // MX records encode priority in the record content for PowerDNS.
    const content =
      dto.type === "MX" && dto.priority != null ? `${dto.priority} ${dto.value}` : dto.value;

    if (this.pdns.configured) {
      try {
        await this.pdns.upsertRecord(dto.domain, dto.name, dto.type, [content], dto.ttl);
        this.logger.log(`Synced ${dto.type} ${dto.name}.${dto.domain} to PowerDNS`);
      } catch (err) {
        this.logger.warn(`PowerDNS sync failed: ${(err as Error).message}`);
      }
    }

    if (!this.prisma.connected) {
      return {
        id: `rec_${Math.abs(hashCode(`${dto.domain}${dto.name}${dto.type}`))}`,
        domain: dto.domain,
        type: dto.type,
        name: dto.name,
        value: dto.value,
        ttl: dto.ttl,
        priority: dto.priority,
        updatedAt: "Queued",
      };
    }

    const domain = await this.prisma.domain.findUnique({ where: { name: dto.domain } });
    if (!domain) throw new NotFoundException(`Domain ${dto.domain} not found`);

    const created = await this.prisma.dnsRecord.create({
      data: {
        type: dto.type,
        name: dto.name,
        value: dto.value,
        ttl: dto.ttl,
        priority: dto.priority ?? null,
        domainId: domain.id,
      },
    });

    return {
      id: created.id,
      domain: dto.domain,
      type: created.type,
      name: created.name,
      value: created.value,
      ttl: created.ttl,
      priority: created.priority ?? undefined,
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  private validateEmailDnsRecord(dto: CreateRecordDto): void {
    const name = dto.name.trim().toLowerCase();
    const value = dto.value.trim();

    if (dto.type === "MX") {
      if (dto.priority === undefined || dto.priority === null) {
        throw new BadRequestException("MX records require a priority value.");
      }

      if (this.looksLikeIpAddress(value)) {
        throw new BadRequestException("MX records must point to a hostname, not an IP address.");
      }

      if (!this.isValidHostname(value)) {
        throw new BadRequestException("MX records must point to a valid hostname.");
      }

      return;
    }

    if (dto.type !== "TXT") {
      return;
    }

    if (value.startsWith("v=spf1")) {
      return;
    }

    if (name.includes("_domainkey") && !value.startsWith("v=DKIM1")) {
      throw new BadRequestException("DKIM TXT records must start with v=DKIM1.");
    }

    if (name === "_dmarc" && !value.startsWith("v=DMARC1")) {
      throw new BadRequestException("DMARC TXT records must start with v=DMARC1.");
    }
  }

  private looksLikeIpAddress(value: string): boolean {
    const trimmed = value.trim();
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed) || trimmed.includes(":");
  }

  private isValidHostname(value: string): boolean {
    const hostname = value.endsWith(".") ? value.slice(0, -1) : value;

    if (hostname.length < 1 || hostname.length > 253) {
      return false;
    }

    return hostname.split(".").every((label) => {
      return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label);
    });
  }
}

/** Deterministic id helper for the no-DB fallback path. */
function hashCode(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}