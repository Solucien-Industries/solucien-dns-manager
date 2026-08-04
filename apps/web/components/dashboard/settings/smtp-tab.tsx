"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Lock, Mail, Pencil, Save, Server, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  generateSmtpPassword,
  getSmtpConfig,
  listSmtpServers,
  revokeSmtpPassword,
  updateSmtpSender,
  updateSmtpServer,
  type SmtpConfig,
  type SmtpServer,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { SendEmailPanel } from "@/components/dashboard/settings/send-email-panel";

type SmtpSettingsTabProps = {
  accessToken: string;
};

type SubTab = "connection" | "servers" | "send";
type PortMode = "submission" | "implicitTls";

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-panel p-3">
      <p className="text-xs font-bold uppercase tracking-normal text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <code className="truncate font-mono text-sm">{value}</code>
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
    </div>
  );
}

export function SmtpSettingsTab({ accessToken }: SmtpSettingsTabProps) {
  const [subTab, setSubTab] = useState<SubTab>("connection");
  const [config, setConfig] = useState<SmtpConfig | null>(null);
  const [servers, setServers] = useState<SmtpServer[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<SmtpServer>>({});
  const [portMode, setPortMode] = useState<PortMode>("submission");
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [savingSender, setSavingSender] = useState(false);
  const [senderSaved, setSenderSaved] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextConfig, nextServers] = await Promise.all([
        getSmtpConfig(accessToken),
        listSmtpServers(accessToken),
      ]);
      setConfig(nextConfig);
      setServers(nextServers);
      setFromEmail(nextConfig.sender.fromEmail);
      setFromName(nextConfig.sender.fromName);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to load SMTP settings.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getSmtpConfig(accessToken), listSmtpServers(accessToken)])
      .then(([nextConfig, nextServers]) => {
        if (cancelled) return;
        setConfig(nextConfig);
        setServers(nextServers);
        setFromEmail(nextConfig.sender.fromEmail);
        setFromName(nextConfig.sender.fromName);
        setError(null);
      })
      .catch((refreshError) => {
        if (cancelled) return;
        setError(refreshError instanceof Error ? refreshError.message : "Failed to load SMTP settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (loading && !config) {
    return <p className="text-sm text-muted-foreground">Loading SMTP relay...</p>;
  }

  if (!config) {
    return <p className="text-sm text-red-600">{error ?? "Unable to load SMTP settings."}</p>;
  }

  const activePort = portMode === "submission" ? config.relay.ports.submission : config.relay.ports.implicitTls;

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setNewPassword(null);
    try {
      const result = await generateSmtpPassword(accessToken);
      setNewPassword(result.password);
      await refresh();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Failed to generate SMTP password.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke() {
    setError(null);
    try {
      await revokeSmtpPassword(accessToken);
      setNewPassword(null);
      await refresh();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke SMTP password.");
    }
  }

  async function handleSaveSender(event: React.FormEvent) {
    event.preventDefault();
    setSavingSender(true);
    setError(null);
    setSenderSaved(false);
    try {
      await updateSmtpSender(accessToken, { fromEmail, fromName });
      setSenderSaved(true);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save sender settings.");
    } finally {
      setSavingSender(false);
    }
  }

  function startEdit(server: SmtpServer) {
    setEditingId(server.id);
    setEditDraft(server);
  }

  async function saveEdit() {
    if (!editingId) return;
    setError(null);
    try {
      await updateSmtpServer(accessToken, editingId, editDraft);
      setEditingId(null);
      setEditDraft({});
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update SMTP server.");
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h3 className="font-semibold">Email delivery relay</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Send mail through the Nani SMTP relay ({config.relay.host}) instead of the REST API.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(
          [
            ["connection", "Connection & credentials"],
            ["servers", "SMTP servers"],
            ["send", "Send email"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={cn(
              "rounded-md border px-3 py-2 text-sm font-semibold transition",
              subTab === id
                ? "border-foreground bg-background text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "connection" ? (
        <>
          <section className="overflow-hidden rounded-md border border-border bg-background">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <h4 className="font-semibold">Connection settings</h4>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
              {(
                [
                  ["submission", "Port 587 · STARTTLS", config.relay.ports.submission.recommended],
                  ["implicitTls", "Port 465 · SSL/TLS", false],
                ] as const
              ).map(([mode, label, recommended]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPortMode(mode)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-semibold transition",
                    portMode === mode
                      ? "border-foreground bg-panel text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {label}
                  {recommended ? " · Recommended" : ""}
                </button>
              ))}
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <CopyField label="Host" value={config.relay.host} />
              <CopyField label="Port" value={String(activePort.port)} />
              <CopyField label="Username" value={config.relay.username} />
              <CopyField label="Encryption" value={activePort.encryption} />
            </div>
          </section>

          <section className="rounded-md border border-border bg-background p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-semibold">SMTP password</h4>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {config.credential.configured
                    ? `Active credential ${config.credential.prefix}…`
                    : "Generate a workspace password."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleGenerate()} disabled={generating}>
                  <KeyRound className="h-4 w-4" />
                  {generating
                    ? "Generating..."
                    : config.credential.configured
                      ? "Rotate password"
                      : "Generate password"}
                </Button>
                {config.credential.configured ? (
                  <Button type="button" variant="outline" onClick={() => void handleRevoke()}>
                    <Trash2 className="h-4 w-4" />
                    Revoke
                  </Button>
                ) : null}
              </div>
            </div>
            {newPassword ? (
              <div className="mt-4 rounded-md border border-border bg-panel p-4">
                <CopyField label="Password (shown once)" value={newPassword} />
              </div>
            ) : null}
          </section>

          <section className="rounded-md border border-border bg-background p-5">
            <h4 className="font-semibold">Default sender identity</h4>
            <form className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={handleSaveSender}>
              <label className="grid gap-2 text-sm font-semibold">
                From name
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                From email
                <Input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
              </label>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Button type="submit" disabled={savingSender}>
                  {savingSender ? "Saving..." : "Save sender"}
                </Button>
                {senderSaved ? (
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Check className="h-4 w-4" />
                    Saved
                  </span>
                ) : null}
              </div>
            </form>
          </section>
        </>
      ) : null}

      {subTab === "servers" ? (
        <section className="grid gap-3">
          {servers.map((server) => (
            <div key={server.id} className="rounded-md border border-border bg-background p-5">
              {editingId === server.id ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold">
                    Label
                    <Input
                      value={editDraft.label ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Host
                    <Input
                      value={editDraft.host ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, host: e.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Port
                    <Input
                      type="number"
                      value={editDraft.port ?? server.port}
                      onChange={(e) => setEditDraft((d) => ({ ...d, port: Number(e.target.value) }))}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Region
                    <Input
                      value={editDraft.region ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, region: e.target.value }))}
                    />
                  </label>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="button" onClick={() => void saveEdit()}>
                      <Save className="h-4 w-4" />
                      Save
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-panel">
                      <Server className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold">
                        {server.label}
                        {server.primary ? " · Primary" : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {server.host}:{server.port} · {server.encryption}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {server.region} · {server.status}
                      </p>
                    </div>
                  </div>
                  {!server.primary ? (
                    <Button type="button" variant="outline" onClick={() => startEdit(server)}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {subTab === "send" ? (
        <SendEmailPanel
          accessToken={accessToken}
          sender={config.sender}
          sendingConfigured={Boolean(config.sendingConfigured)}
        />
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}