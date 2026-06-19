import { Download, Globe2, Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DomainVerificationPanel } from "@/components/dashboard/domain-verification-panel";
import { exportDomainZone, type DashboardData } from "@/lib/api";
import { PLATFORM_NAMESERVERS } from "@/lib/dns-utils";
import { cn } from "@/lib/utils";

type DomainsSectionProps = {
  accessToken: string;
  data: DashboardData;
  onAddDomain: () => void;
  onVerified: () => void;
};

export function DomainsSection({ accessToken, data, onAddDomain, onVerified }: DomainsSectionProps) {
  async function handleExport(domain: string) {
    try {
      const exported = await exportDomainZone(accessToken, domain);
      const blob = new Blob([exported.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${domain}.zone`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // fallback silent for now
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Domains</p>
          <h1 className="mt-1 text-3xl font-semibold">Manage authoritative zones</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Add domains the way you would in Cloudflare or GoDaddy: create the zone here, then point nameservers at your registrar.
          </p>
        </div>
        <Button onClick={onAddDomain}>
          <Plus className="h-4 w-4" />
          Add domain
        </Button>
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

      {data.domains.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-panel p-10 text-center">
          <Globe2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-4 font-semibold">No domains yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Add your first domain to provision a PowerDNS zone.</p>
          <Button className="mt-5" onClick={onAddDomain}>
            <Plus className="h-4 w-4" />
            Add domain
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {data.domains.map((domain) => (
            <div key={domain.id} className="rounded-md border border-border bg-panel p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                    <Globe2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold">{domain.name}</p>
                    <p className="text-sm text-muted-foreground">{domain.owner}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Button type="button" variant="outline" className="h-8" onClick={() => void handleExport(domain.name)}>
                    <Download className="h-3.5 w-3.5" />
                    Export zone
                  </Button>
                  <span
                    className={cn(
                      "rounded border px-2 py-1 text-xs font-bold",
                      domain.status === "Active" && "border-foreground text-foreground",
                      domain.status === "Pending" && "border-amber-500 text-amber-700 dark:text-amber-300",
                      domain.status === "Attention" && "border-red-500 text-red-700 dark:text-red-300",
                      domain.status !== "Active" &&
                        domain.status !== "Pending" &&
                        domain.status !== "Attention" &&
                        "border-border text-muted-foreground",
                    )}
                  >
                    {domain.status}
                  </span>
                  <span className="text-muted-foreground">{domain.records} records</span>
                  <span className="text-muted-foreground">Sync: {domain.lastSync}</span>
                </div>
              </div>

              {domain.status === "Pending" ? (
                <div className="mt-4">
                  <DomainVerificationPanel
                    accessToken={accessToken}
                    domain={domain.name}
                    autoPoll
                    compact
                    onVerified={onVerified}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
