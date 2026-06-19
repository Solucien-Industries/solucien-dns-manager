import { Injectable } from "@nestjs/common";
import { NANI_NAMESERVERS } from "@solucien/shared";
import { PowerDnsService } from "../powerdns/powerdns.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

export type DependencyCheck = {
  id: string;
  label: string;
  status: "healthy" | "degraded" | "offline" | "optional";
  latencyMs: number | null;
  detail: string;
  checkedAt: string;
};

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly pdns: PowerDnsService,
  ) {}

  async getStatus(): Promise<{ overall: "healthy" | "degraded" | "offline"; checks: DependencyCheck[] }> {
    const checkedAt = new Date().toISOString();
    const checks = await Promise.all([
      this.checkDatabase(checkedAt),
      this.checkRedis(checkedAt),
      this.checkPowerDns(checkedAt),
      this.checkNameservers(checkedAt),
    ]);

    const hasOffline = checks.some((check) => check.status === "offline");
    const hasDegraded = checks.some((check) => check.status === "degraded");

    return {
      overall: hasOffline ? "offline" : hasDegraded ? "degraded" : "healthy",
      checks,
    };
  }

  private async checkDatabase(checkedAt: string): Promise<DependencyCheck> {
    const start = Date.now();
    if (!this.prisma.connected) {
      return {
        id: "postgres",
        label: "PostgreSQL",
        status: "optional",
        latencyMs: null,
        detail: "Not connected — serving in-memory fallback data.",
        checkedAt,
      };
    }

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        id: "postgres",
        label: "PostgreSQL",
        status: "healthy",
        latencyMs: Date.now() - start,
        detail: "Database reachable and accepting queries.",
        checkedAt,
      };
    } catch (err) {
      return {
        id: "postgres",
        label: "PostgreSQL",
        status: "offline",
        latencyMs: Date.now() - start,
        detail: `Query failed: ${(err as Error).message}`,
        checkedAt,
      };
    }
  }

  private async checkRedis(checkedAt: string): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      const pong = await this.redis.client.ping();
      const latencyMs = Date.now() - start;
      return {
        id: "redis",
        label: "Redis cache",
        status: pong === "PONG" ? "healthy" : "degraded",
        latencyMs,
        detail: pong === "PONG" ? "Cache layer responding to PING." : "Unexpected Redis response.",
        checkedAt,
      };
    } catch {
      return {
        id: "redis",
        label: "Redis cache",
        status: "optional",
        latencyMs: Date.now() - start,
        detail: "Unavailable — dashboard cache bypassed.",
        checkedAt,
      };
    }
  }

  private async checkPowerDns(checkedAt: string): Promise<DependencyCheck> {
    if (!this.pdns.configured) {
      return {
        id: "powerdns",
        label: "PowerDNS API",
        status: "optional",
        latencyMs: null,
        detail: "PDNS_API_KEY not configured — zone provisioning skipped.",
        checkedAt,
      };
    }

    const start = Date.now();
    try {
      await this.pdns.listZones();
      return {
        id: "powerdns",
        label: "PowerDNS API",
        status: "healthy",
        latencyMs: Date.now() - start,
        detail: "Authoritative API reachable.",
        checkedAt,
      };
    } catch (err) {
      return {
        id: "powerdns",
        label: "PowerDNS API",
        status: "degraded",
        latencyMs: Date.now() - start,
        detail: `Unreachable: ${(err as Error).message}`,
        checkedAt,
      };
    }
  }

  private async checkNameservers(checkedAt: string): Promise<DependencyCheck> {
    const start = Date.now();
    const { resolve4 } = await import("dns/promises");
    const results = await Promise.allSettled(NANI_NAMESERVERS.map((host) => resolve4(host)));

    const resolved = results.filter((result) => result.status === "fulfilled").length;
    const latencyMs = Date.now() - start;

    if (resolved === NANI_NAMESERVERS.length) {
      return {
        id: "nameservers",
        label: "Nani nameservers",
        status: "healthy",
        latencyMs,
        detail: `${NANI_NAMESERVERS.join(" and ")} resolve publicly.`,
        checkedAt,
      };
    }

    if (resolved > 0) {
      return {
        id: "nameservers",
        label: "Nani nameservers",
        status: "degraded",
        latencyMs,
        detail: `${resolved}/${NANI_NAMESERVERS.length} nameservers resolved.`,
        checkedAt,
      };
    }

    return {
      id: "nameservers",
      label: "Nani nameservers",
      status: "degraded",
      latencyMs,
      detail: "Could not resolve platform nameservers from this host.",
      checkedAt,
    };
  }
}
