"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyDomainDelegation, type DomainVerification } from "@/lib/api";
import { PLATFORM_NAMESERVERS } from "@/lib/dns-utils";
import { cn } from "@/lib/utils";

type DomainVerificationPanelProps = {
  accessToken: string;
  domain: string;
  autoPoll?: boolean;
  compact?: boolean;
  onVerified?: () => void;
};

export function DomainVerificationPanel({
  accessToken,
  domain,
  autoPoll = false,
  compact = false,
  onVerified,
}: DomainVerificationPanelProps) {
  const [verification, setVerification] = useState<DomainVerification | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const result = await verifyDomainDelegation(accessToken, domain);
      setVerification(result);
      if (result.verified) onVerified?.();
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Verification check failed.");
    } finally {
      setChecking(false);
    }
  }, [accessToken, domain, onVerified]);

  useEffect(() => {
    let cancelled = false;

    verifyDomainDelegation(accessToken, domain)
      .then((result) => {
        if (cancelled) return;
        setVerification(result);
        setError(null);
        if (result.verified) onVerified?.();
      })
      .catch((checkError) => {
        if (cancelled) return;
        setError(checkError instanceof Error ? checkError.message : "Verification check failed.");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, domain, onVerified]);

  useEffect(() => {
    if (!autoPoll || verification?.verified) return;
    const timer = window.setInterval(() => void runCheck(), 15_000);
    return () => window.clearInterval(timer);
  }, [autoPoll, verification?.verified, runCheck]);

  const steps = [
    {
      label: "Zone created in Nani",
      done: true,
    },
    {
      label: "Update nameservers at registrar",
      done: Boolean(verification?.detectedNameservers.length),
    },
    {
      label: "Delegation verified",
      done: Boolean(verification?.verified),
    },
  ];

  return (
    <div className={cn("rounded-md border border-border bg-panel", compact ? "p-4" : "p-5")}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold">Nameserver verification</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {verification?.message ?? "Checking public DNS delegation..."}
          </p>
        </div>
        <Button type="button" variant="outline" className="h-9 shrink-0" disabled={checking} onClick={() => void runCheck()}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Check now
        </Button>
      </div>

      <div className="mt-4 grid gap-2">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border",
                step.done ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground",
              )}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </span>
            <span className={step.done ? "font-semibold" : "text-muted-foreground"}>{step.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-xs font-bold uppercase tracking-normal text-muted-foreground">Expected</p>
          <div className="mt-2 grid gap-1">
            {PLATFORM_NAMESERVERS.map((ns) => (
              <code key={ns} className="text-xs">{ns}</code>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-xs font-bold uppercase tracking-normal text-muted-foreground">Detected</p>
          <div className="mt-2 grid gap-1">
            {verification?.detectedNameservers.length ? (
              verification.detectedNameservers.map((ns) => (
                <code key={ns} className="text-xs">{ns}</code>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No delegation found yet</span>
            )}
          </div>
        </div>
      </div>

      {verification ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm">
          {verification.verified ? (
            <>
              <Check className="h-4 w-4" />
              Verified and active
            </>
          ) : verification.state === "propagating" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Propagation in progress
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4" />
              Pending registrar update
            </>
          )}
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
