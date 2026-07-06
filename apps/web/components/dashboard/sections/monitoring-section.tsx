"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMonitoringStatus, type MonitoringStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

type MonitoringSectionProps = {
  accessToken: string;
};

const statusStyles = {
  healthy: "border-foreground text-foreground",
  degraded: "border-amber-500 text-amber-700 dark:text-amber-300",
  offline: "border-red-500 text-red-700 dark:text-red-300",
  optional: "border-border text-muted-foreground",
};

export function MonitoringSection({ accessToken }: MonitoringSectionProps) {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getMonitoringStatus(accessToken));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to load monitoring data.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Monitoring</p>
          <h1 className="mt-1 text-3xl font-semibold">Platform health</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Live dependency checks against PostgreSQL, Redis, PowerDNS, and Nani nameservers.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {status ? (
        <section className="rounded-md border border-border bg-panel p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold capitalize">Overall status: {status.overall}</p>
              <p className="text-sm text-muted-foreground">
                Last checked {new Date(status.checks[0]?.checkedAt ?? Date.now()).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {(status?.checks ?? []).map((check) => (
          <div key={check.id} className="rounded-md border border-border bg-panel p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold">{check.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {check.latencyMs != null ? `${check.latencyMs} ms` : "No latency sample"}
                  </p>
                </div>
              </div>
              <span className={cn("rounded border px-2 py-1 text-xs font-bold capitalize", statusStyles[check.status])}>
                {check.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{check.detail}</p>
          </div>
        ))}
      </div>

      {loading && !status ? <p className="text-sm text-muted-foreground">Running health checks...</p> : null}
    </div>
  );
}
