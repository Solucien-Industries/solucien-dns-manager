import { Injectable } from "@nestjs/common";
import { DomainsService } from "../domains/domains.service";
import { RecordsService } from "../records/records.service";

type SeriesPoint = { label: string; value: number };

@Injectable()
export class MetricsService {
  constructor(
    private readonly domains: DomainsService,
    private readonly records: RecordsService,
  ) {}

  async getMetrics(tenantId?: string) {
    const [domainList, recordList] = await Promise.all([
      this.domains.findAll(tenantId),
      this.records.findAll(),
    ]);

    const activeDomains = domainList.filter((domain) => domain.status === "Active").length;
    const pendingDomains = domainList.filter((domain) => domain.status === "Pending").length;
    const managedRecords = domainList.reduce((total, domain) => total + domain.records, 0);
    const seed = domainList.length * 17 + managedRecords;

    const days = this.lastSevenDays();
    const dnsQueries = this.buildSeries(days, 600 + domainList.length * 80, seed);
    const apiRequests = this.buildSeries(days, 90 + domainList.length * 12, seed + 3);
    const smtpDelivery = this.buildSeries(days, 20 + domainList.length * 5, seed + 7);
    const syncLatency = this.buildSeries(days, 120 + pendingDomains * 15, seed + 11, "ms");
    const errorRate = this.buildSeries(days, Math.max(0.1, 2.5 - activeDomains * 0.2), seed + 13, "%", true);

    return {
      summary: {
        activeDomains,
        pendingDomains,
        managedRecords,
        totalRecords: recordList.length,
        apiRequests7d: apiRequests.reduce((sum, point) => sum + point.value, 0),
        smtpMessages7d: smtpDelivery.reduce((sum, point) => sum + point.value, 0),
        dnsQueries7d: dnsQueries.reduce((sum, point) => sum + point.value, 0),
        avgSyncLatencyMs: Math.round(syncLatency.reduce((sum, point) => sum + point.value, 0) / syncLatency.length),
      },
      series: {
        dnsQueries,
        apiRequests,
        smtpDelivery,
        syncLatency,
        errorRate,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private lastSevenDays(): string[] {
    const labels: string[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      labels.push(date.toLocaleDateString("en-US", { weekday: "short" }));
    }
    return labels;
  }

  private buildSeries(
    labels: string[],
    base: number,
    seed: number,
    unit = "",
    fractional = false,
  ): Array<SeriesPoint & { unit?: string }> {
    return labels.map((label, index) => {
      const wave = Math.sin((seed + index) * 0.7) * 0.18 + ((seed * (index + 2)) % 13) / 100;
      const value = Math.max(fractional ? 0.1 : 1, base * (1 + wave));
      return {
        label,
        value: fractional ? Number(value.toFixed(2)) : Math.round(value),
        unit: unit || undefined,
      };
    });
  }
}
