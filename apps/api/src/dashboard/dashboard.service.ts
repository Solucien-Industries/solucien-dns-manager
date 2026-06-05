import { Injectable } from "@nestjs/common";
import { computeStats, seedDashboard, type DashboardData } from "@solucien/shared";
import { DomainsService } from "../domains/domains.service";
import { RecordsService } from "../records/records.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class DashboardService {
  constructor(
    private readonly domains: DomainsService,
    private readonly records: RecordsService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Aggregated payload consumed by the Next.js dashboard. Shape matches the
   * web app's expectation: { domains, records, stats }. Cached briefly in Redis.
   */
  async getDashboard(tenantId?: string): Promise<DashboardData> {
    const cacheKey = `dashboard:${tenantId ?? "all"}`;
    const cached = await this.redis.get<DashboardData>(cacheKey);
    if (cached) return cached;

    try {
      const [domains, records] = await Promise.all([
        this.domains.findAll(tenantId),
        this.records.findAll(),
      ]);
      const payload: DashboardData = { domains, records, stats: computeStats(domains) };
      await this.redis.set(cacheKey, payload, 15);
      return payload;
    } catch {
      // Last-resort fallback so the UI never breaks.
      return seedDashboard();
    }
  }
}
