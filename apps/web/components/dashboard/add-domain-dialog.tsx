"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Globe2, Server, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DomainVerificationPanel } from "@/components/dashboard/domain-verification-panel";
import { Input } from "@/components/ui/input";
import { createDomain } from "@/lib/api";
import type { Domain } from "@/lib/mock-dns";
import { isValidDomainName, normalizeDomainName, PLATFORM_NAMESERVERS } from "@/lib/dns-utils";
import { cn } from "@/lib/utils";

type AddDomainDialogProps = {
  open: boolean;
  accessToken: string;
  defaultOwner: string;
  onClose: () => void;
  onCreated: () => void;
  onVerified?: () => void;
};

type Step = "domain" | "review" | "success";

export function AddDomainDialog({
  open,
  accessToken,
  defaultOwner,
  onClose,
  onCreated,
  onVerified,
}: AddDomainDialogProps) {
  const [step, setStep] = useState<Step>("domain");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState(defaultOwner);
  const [created, setCreated] = useState<Domain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const normalized = useMemo(() => normalizeDomainName(name), [name]);
  const valid = isValidDomainName(normalized);

  // Adjust state during render when the dialog (re)opens, instead of syncing
  // via an Effect (see https://react.dev/learn/you-might-not-need-an-effect).
  const [prevKey, setPrevKey] = useState({ open, defaultOwner });
  if (prevKey.open !== open || prevKey.defaultOwner !== defaultOwner) {
    setPrevKey({ open, defaultOwner });
    if (open) {
      setStep("domain");
      setName("");
      setOwner(defaultOwner);
      setCreated(null);
      setError(null);
      setSubmitting(false);
    }
  }

  if (!open) return null;

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const domain = await createDomain(accessToken, {
        name: normalized,
        owner: owner.trim(),
      });
      setCreated(domain);
      setStep("success");
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to add domain.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl overflow-hidden rounded-md border border-border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Add a site</p>
            <h2 className="text-xl font-semibold">Connect your domain to Nani DNS</h2>
          </div>
          <Button variant="ghost" className="h-10 w-10 px-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-2 border-b border-border px-5 py-4 sm:grid-cols-3">
          {[
            ["1. Enter domain", "domain"],
            ["2. Review setup", "review"],
            ["3. Go live", "success"],
          ].map(([label, id]) => (
            <div
              key={id}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-semibold",
                step === id ? "border-foreground bg-panel text-foreground" : "border-border text-muted-foreground",
              )}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="p-5">
          {step === "domain" ? (
            <div className="grid gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Enter the domain you manage at your registrar. We will create the authoritative zone and assign Nani nameservers.
              </p>
              <label className="grid gap-2 text-sm font-semibold">
                Domain name
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="example.com"
                  autoFocus
                />
              </label>
              {name ? (
                <p className={cn("text-sm", valid ? "text-muted-foreground" : "text-red-600")}>
                  {valid ? `Zone preview: ${normalized}.` : "Enter a valid domain like example.com or solucien.cd."}
                </p>
              ) : null}
              <label className="grid gap-2 text-sm font-semibold">
                Registrant / owner label
                <Input value={owner} onChange={(event) => setOwner(event.target.value)} />
              </label>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="grid gap-4">
              <div className="rounded-md border border-border bg-panel p-4">
                <div className="flex items-start gap-3">
                  <Globe2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{normalized}</p>
                    <p className="text-sm text-muted-foreground">Owner: {owner.trim()}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-panel p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <p className="font-semibold">Assigned nameservers</p>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">
                  After the zone is created, update these at your registrar (GoDaddy, Cloudflare registrar, etc.).
                </p>
                <div className="grid gap-2">
                  {PLATFORM_NAMESERVERS.map((ns) => (
                    <div key={ns} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                      <code className="text-sm">{ns}</code>
                      <Button type="button" variant="outline" className="h-8" onClick={() => void copy(ns)}>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === "success" && created ? (
            <div className="grid gap-4">
              <div className="flex items-start gap-3 rounded-md border border-border bg-panel p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{created.name} is ready in Nani DNS</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Status: {created.status}. Update nameservers at your registrar to activate global resolution.
                  </p>
                </div>
              </div>
              <ol className="grid gap-2 text-sm text-muted-foreground">
                <li>1. Open your registrar DNS settings.</li>
                <li>2. Replace existing nameservers with the Nani pair shown earlier.</li>
                <li>3. Wait for propagation — we will verify delegation automatically.</li>
              </ol>
              <DomainVerificationPanel
                accessToken={accessToken}
                domain={created.name}
                autoPoll
                onVerified={onVerified}
              />
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-between gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {step === "success" ? "Close" : "Cancel"}
          </Button>
          <div className="flex gap-2">
            {step === "review" ? (
              <Button type="button" variant="outline" onClick={() => setStep("domain")}>
                Back
              </Button>
            ) : null}
            {step === "domain" ? (
              <Button type="button" disabled={!valid || !owner.trim()} onClick={() => setStep("review")}>
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
            {step === "review" ? (
              <Button type="button" disabled={submitting} onClick={() => void handleCreate()}>
                {submitting ? "Creating zone..." : "Add domain"}
              </Button>
            ) : null}
            {step === "success" ? (
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
