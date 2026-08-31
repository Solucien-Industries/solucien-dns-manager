"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  enableSendingDomain,
  listSendingDomains,
  refreshSendingDomain,
  type SendingDomain,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type SendingDomainsPanelProps = {
  accessToken: string;
};

/**
 * Because Nani hosts the customer's DNS, enabling email is one action rather
 * than a list of records to copy: we register the domain with the mail provider
 * and write the DKIM, SPF and DMARC records into their zone ourselves.
 *
 * The panel's job is to make the wait legible — the records go in instantly,
 * but the provider takes a few minutes to confirm them, and a screen that says
 * nothing during that gap reads as broken.
 */
export function SendingDomainsPanel({ accessToken }: SendingDomainsPanelProps) {
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDomains(await listSendingDomains(accessToken));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load sending domains.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while something is mid-verification. A permanent timer would keep
  // hitting the mail provider for screens that have nothing left to change.
  useEffect(() => {
    const pending = domains.filter((d) => d.sendingVerification === "VERIFYING");
    if (!pending.length) return;

    const timer = setInterval(() => {
      void Promise.all(pending.map((d) => refreshSendingDomain(accessToken, d.domain)))
        .then((updated) => {
          setDomains((current) =>
            current.map((d) => updated.find((u) => u.domain === d.domain) ?? d),
          );
        })
        .catch(() => {
          /* a failed poll is not worth interrupting the page for */
        });
    }, 15000);

    return () => clearInterval(timer);
  }, [domains, accessToken]);

  async function handleEnable(domain: string) {
    setBusy(domain);
    setError(null);
    try {
      const updated = await enableSendingDomain(accessToken, domain);
      setDomains((current) => current.map((d) => (d.domain === domain ? updated : d)));
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : "Could not set up email.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRefresh(domain: string) {
    setBusy(domain);
    try {
      const updated = await refreshSendingDomain(accessToken, domain);
      setDomains((current) => current.map((d) => (d.domain === domain ? updated : d)));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not check status.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading domains...</p>;
  }

  if (!domains.length) {
    return (
      <div className="rounded-md border border-border bg-panel p-6 text-center">
        <p className="text-sm font-medium">No domains yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a domain under Domains, point its nameservers at Nani, then come back to turn on email.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Email sending</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn on email for a domain and we add the DKIM, SPF and DMARC records to its zone for you.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="space-y-3">
        {domains.map((domain) => (
          <DomainRow
            key={domain.domain}
            domain={domain}
            busy={busy === domain.domain}
            onEnable={() => void handleEnable(domain.domain)}
            onRefresh={() => void handleRefresh(domain.domain)}
          />
        ))}
      </div>
    </div>
  );
}

function DomainRow({
  domain,
  busy,
  onEnable,
  onRefresh,
}: {
  domain: SendingDomain;
  busy: boolean;
  onEnable: () => void;
  onRefresh: () => void;
}) {
  const state = domain.canSend
    ? "verified"
    : domain.sendingVerification === "VERIFYING"
      ? "verifying"
      : domain.sendingVerification === "FAILED"
        ? "failed"
        : "off";

  return (
    <div className="rounded-md border border-border bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StateIcon state={state} />
            <p className="truncate font-mono text-sm font-medium">{domain.domain}</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{domain.message}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {state === "verifying" ? (
            <Button type="button" variant="outline" className="h-8" onClick={onRefresh} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Check now
            </Button>
          ) : null}

          {state === "off" || state === "failed" ? (
            <Button type="button" className="h-8" onClick={onEnable} disabled={busy || !domain.delegated}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {state === "failed" ? "Try again" : "Turn on email"}
            </Button>
          ) : null}
        </div>
      </div>

      {domain.records.length ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Records added to this zone</p>
          <ul className="mt-2 space-y-1">
            {domain.records.map((record) => (
              <li key={`${record.purpose}-${record.name}`} className="flex items-center gap-2 text-xs">
                {record.published ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                )}
                <span className="w-14 shrink-0 font-medium">{record.purpose}</span>
                <code className="truncate font-mono text-muted-foreground">
                  {record.name === "@" ? domain.domain : `${record.name}.${domain.domain}`}
                </code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StateIcon({ state }: { state: "verified" | "verifying" | "failed" | "off" }) {
  const className = "h-4 w-4 shrink-0";
  if (state === "verified") return <CheckCircle2 className={cn(className, "text-emerald-600")} />;
  if (state === "verifying") return <Clock className={cn(className, "text-amber-600")} />;
  if (state === "failed") return <XCircle className={cn(className, "text-red-600")} />;
  return <Circle className={cn(className, "text-muted-foreground")} />;
}
