"use client";

import { useEffect, useState } from "react";
import { getMetrics, type MetricsPayload } from "@/lib/api";
import { MetricBarChart, MetricLineChart, MetricStatGrid } from "@/components/dashboard/metric-chart";

type MetricsSectionProps = {
  accessToken: string;
};

export function MetricsSection({ accessToken }: MetricsSectionProps) {
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await getMetrics(accessToken);
        if (active) setMetrics(payload);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load metrics.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [accessToken]);

  if (loading && !metrics) {
    return <p className="text-sm text-muted-foreground">Loading metrics...</p>;
  }

  if (!metrics) {
    return <p className="text-sm text-red-600">{error ?? "Unable to load metrics."}</p>;
  }

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Metrics</p>
        <h1 className="mt-1 text-3xl font-semibold">Workspace analytics</h1>
      </div>

      <section className="rounded-md border border-border bg-panel p-5">
        <h3 className="font-semibold">Zone summary</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Active domains", metrics.summary.activeDomains],
            ["Pending verification", metrics.summary.pendingDomains],
            ["Managed records", metrics.summary.managedRecords],
            ["Indexed records", metrics.summary.totalRecords],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <MetricStatGrid
        items={[
          { label: "DNS queries (7d)", value: metrics.summary.dnsQueries7d.toLocaleString(), hint: "Authoritative traffic" },
          { label: "API requests (7d)", value: metrics.summary.apiRequests7d.toLocaleString(), hint: "Authenticated calls" },
          { label: "SMTP messages (7d)", value: metrics.summary.smtpMessages7d.toLocaleString(), hint: "Relay delivery" },
          { label: "Avg sync latency", value: `${metrics.summary.avgSyncLatencyMs} ms`, hint: "Zone propagation" },
        ]}
      />

      <MetricLineChart title="DNS query volume" points={metrics.series.dnsQueries} />

      <div className="grid gap-5 xl:grid-cols-2">
        <MetricLineChart title="API usage" points={metrics.series.apiRequests} />
        <MetricLineChart title="SMTP delivery" points={metrics.series.smtpDelivery} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <MetricLineChart title="Zone sync latency" points={metrics.series.syncLatency} unit="ms" />
        <MetricLineChart title="Error rate" points={metrics.series.errorRate} unit="%" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <MetricBarChart title="Daily DNS queries" bars={metrics.series.dnsQueries} />
        <MetricBarChart title="Daily API requests" bars={metrics.series.apiRequests} />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
