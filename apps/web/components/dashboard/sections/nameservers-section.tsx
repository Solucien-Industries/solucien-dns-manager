import { Check, Server } from "lucide-react";
import { PLATFORM_NAMESERVERS } from "@/lib/dns-utils";

export function NameserversSection() {
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Nameservers</p>
        <h1 className="mt-1 text-3xl font-semibold">Nani authoritative routing</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every new zone is assigned this pair automatically. Update them at your registrar to delegate DNS to Nani.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {PLATFORM_NAMESERVERS.map((nameserver, index) => (
          <div key={nameserver} className="rounded-md border border-border bg-panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
                  <Server className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-normal text-muted-foreground">
                    {index === 0 ? "Europe" : "Africa"}
                  </p>
                  <p className="font-semibold">{nameserver}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-bold">
                <Check className="h-3 w-3" />
                Healthy
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Assigned automatically to new zones created in this workspace.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
