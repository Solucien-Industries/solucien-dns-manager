"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CircleAlert, Globe2, Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/lib/api";
import { getMetrics, type MetricsPayload } from "@/lib/api";
import { PLATFORM_NAMESERVERS } from "@/lib/dns-utils";
import { MetricLineChart } from "@/components/dashboard/metric-chart";

type OverviewSectionProps = {
  accessToken: string;
  data: DashboardData;
  onAddDomain: () => void;
  onOpenMetrics?: () => void;
};

export function OverviewSection({ accessToken, data, onAddDomain, onOpenMetrics }: OverviewSectionProps) {
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);

  useEffect(() => {
    void getMetrics(accessToken)
      .then(setMetrics)
      .catch(() => setMetrics(null));
  }, [accessToken]);

  return (
    <div className="grid gap-5">
      <div className="rounded-md border border-border bg-panel p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Workspace overview</p>
            <h1 className="mt-1 text-3xl font-semibold">DNS, SMTP, and platform health</h1>
          </div>
          <Button onClick={onAddDomain}>
            <Plus className="h-4 w-4" />
            Add domain
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Active domains", data.stats.activeDomains],
            ["DNS records", data.stats.managedRecords],
            ["Pending review", data.stats.attentionItems],
            ["Platform NS", data.stats.nameservers],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border bg-background p-4">
              <p className="text-3xl font-semibold">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="rounded-md border border-border bg-panel p-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Nani nameservers</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PLATFORM_NAMESERVERS.map((ns) => (
            <code key={ns} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              {ns}
            </code>
          ))}
        </div>
      </section>

      {metrics ? (
        <section className="grid gap-4 rounded-md border border-border bg-panel p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Recent activity</p>
              <h2 className="text-xl font-semibold">7-day usage snapshot</h2>
            </div>
            {onOpenMetrics ? (
              <Button variant="outline" onClick={onOpenMetrics}>
                View all metrics
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["DNS queries", metrics.summary.dnsQueries7d.toLocaleString()],
              ["API requests", metrics.summary.apiRequests7d.toLocaleString()],
              ["SMTP messages", metrics.summary.smtpMessages7d.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <MetricLineChart title="DNS query trend" points={metrics.series.dnsQueries} />
        </section>
      ) : null}

      <section className="rounded-md border border-border bg-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Recent domains</h2>
        </div>
        <div className="grid gap-2">
          {data.domains.slice(0, 4).map((domain) => (
            <div key={domain.id} className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3 text-sm">
              <div>
                <p className="font-semibold">{domain.name}</p>
                <p className="text-muted-foreground">{domain.owner}</p>
              </div>
              <span className="text-muted-foreground">{domain.status}</span>
            </div>
          ))}
        </div>
      </section>

      {data.stats.attentionItems > 0 ? (
        <section className="flex items-start gap-3 rounded-md border border-border bg-panel p-4">
          <CircleAlert className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold">{data.stats.attentionItems} domain(s) need attention</p>
            <p className="text-sm text-muted-foreground">Review verification, sync status, or record conflicts in Domains and Monitoring.</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
