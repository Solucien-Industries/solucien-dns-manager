"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSmtpCredential,
  listSmtpCredentials,
  rotateSmtpCredential,
  revokeSmtpCredential,
  type SmtpCredential,
  type SmtpCredentialCreated,
} from "@/lib/api";

type CredentialsPanelProps = {
  accessToken: string;
};

/**
 * SMTP credentials for connecting a mail client or application to the relay.
 *
 * The password appears once, at creation, and is never retrievable — we store
 * only a hash. The interface has to make that unmissable, because a customer
 * who closes the panel assuming they can find it later has to rotate and update
 * every application that used it.
 */
export function CredentialsPanel({ accessToken }: CredentialsPanelProps) {
  const [credentials, setCredentials] = useState<SmtpCredential[]>([]);
  const [reveal, setReveal] = useState<SmtpCredentialCreated | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCredentials(await listSmtpCredentials(accessToken));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load credentials.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    setBusy("create");
    setError(null);
    try {
      const created = await createSmtpCredential(accessToken, { name: name.trim() || undefined });
      setReveal(created);
      setName("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the credential.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRotate(id: string) {
    setBusy(id);
    setError(null);
    try {
      setReveal(await rotateSmtpCredential(accessToken, id));
      await load();
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : "Could not rotate the credential.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      await revokeSmtpCredential(accessToken, id);
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke the credential.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">SMTP credentials</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Use these to connect an application or mail client to the relay.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {reveal ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Copy this password now</p>
          <p className="mt-1 text-sm text-amber-800">
            This is the only time it is shown. If you lose it, rotate the credential to get a new one.
          </p>
          <div className="mt-3 space-y-2">
            <RevealField label="Username" value={reveal.credential.username} />
            <RevealField label="Password" value={reveal.password} />
          </div>
          <Button type="button" variant="outline" className="mt-3 h-8" onClick={() => setReveal(null)}>
            I have saved it
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="credential-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="credential-name"
            value={name}
            placeholder="Billing service"
            onChange={(event) => setName(event.target.value)}
            className="mt-1"
          />
        </div>
        <Button type="button" onClick={() => void handleCreate()} disabled={busy === "create"}>
          {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Create credential
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading credentials...</p>
      ) : credentials.length === 0 ? (
        <div className="rounded-md border border-border bg-panel p-6 text-center">
          <p className="text-sm font-medium">No credentials yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one above to start sending through the relay.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map((credential) => (
            <div
              key={credential.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-panel p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{credential.name}</p>
                <code className="block truncate font-mono text-xs text-muted-foreground">
                  {credential.username}
                </code>
                <p className="mt-1 text-xs text-muted-foreground">
                  {credential.domain ? `${credential.domain} only` : "All verified domains"}
                  {" · "}
                  {credential.lastUsedAt
                    ? `Last used ${new Date(credential.lastUsedAt).toLocaleString()}`
                    : "Never used"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8"
                  onClick={() => void handleRotate(credential.id)}
                  disabled={busy === credential.id}
                >
                  {busy === credential.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="h-3.5 w-3.5" />
                  )}
                  Rotate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8"
                  onClick={() => void handleRevoke(credential.id)}
                  disabled={busy === credential.id}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RevealField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-amber-200 bg-white p-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <code className="block truncate font-mono text-sm">{value}</code>
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-8 shrink-0"
        onClick={() => void navigator.clipboard.writeText(value)}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy
      </Button>
    </div>
  );
}
