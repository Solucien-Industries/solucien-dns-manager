"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createApiKey,
  DOCS_URL,
  listApiKeys,
  revokeApiKey,
  type ApiKeySummary,
} from "@/lib/api";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/dashboard-nav";
import { BillingSettingsTab } from "@/components/dashboard/settings/billing-tab";
import { EmailActivityTab } from "@/components/dashboard/settings/email-activity-tab";
import { SmtpSettingsTab } from "@/components/dashboard/settings/smtp-tab";
import { UsersSettingsTab } from "@/components/dashboard/settings/users-tab";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
};

type SettingsPanelProps = {
  accessToken: string;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  user: AuthUser | null;
};

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}) {
  return (
    <div className="border-b border-border">
      <div className="flex gap-1 overflow-x-auto">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition",
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-background p-5">
      <h3 className="font-semibold">{title}</h3>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ApiSettingsTab({ accessToken }: { accessToken: string }) {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [name, setName] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await listApiKeys(accessToken));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to load API keys.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;

    listApiKeys(accessToken)
      .then((result) => {
        if (cancelled) return;
        setKeys(result);
        setError(null);
      })
      .catch((refreshError) => {
        if (cancelled) return;
        setError(refreshError instanceof Error ? refreshError.message : "Failed to load API keys.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setNewSecret(null);

    try {
      const result = await createApiKey(accessToken, name.trim());
      setNewSecret(result.secret);
      setName("");
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create API key.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setError(null);
    try {
      await revokeApiKey(accessToken, id);
      await refresh();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke API key.");
    }
  }

  async function copySecret() {
    if (!newSecret) return;
    await navigator.clipboard.writeText(newSecret);
  }

  return (
    <div className="grid gap-4">
      <SettingsCard title="API base URL" description="All REST endpoints are served from this host.">
        <code className="block rounded-md bg-panel px-3 py-2 text-sm">{API_URL}/api</code>
      </SettingsCard>

      <SettingsCard
        title="Documentation"
        description="Nani API reference, keys, and developer documentation."
      >
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:bg-muted"
        >
          Open Nani API docs
          <ExternalLink className="h-4 w-4" />
        </a>
      </SettingsCard>

      <SettingsCard title="Generate API key" description="Create a programmatic access token for scripts and CI.">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleCreate}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Key name, e.g. CI deployment"
            required
            className="flex-1"
          />
          <Button type="submit" disabled={creating}>
            <KeyRound className="h-4 w-4" />
            {creating ? "Generating..." : "Generate key"}
          </Button>
        </form>

        {newSecret ? (
          <div className="mt-4 rounded-md border border-border bg-panel p-4">
            <p className="text-sm font-semibold">Copy your new key now</p>
            <p className="mt-1 text-xs text-muted-foreground">This secret is shown only once.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="block flex-1 overflow-x-auto rounded bg-background px-3 py-2 text-xs">{newSecret}</code>
              <Button type="button" variant="outline" onClick={() => void copySecret()}>
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard title="Active keys">
        {loading ? <p className="text-sm text-muted-foreground">Loading keys...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!loading && keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : null}
        {!loading && keys.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-xs font-bold uppercase tracking-normal text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Prefix</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-3 font-semibold">{key.name}</td>
                    <td className="px-2 py-3 font-mono text-xs">{key.prefix}…</td>
                    <td className="px-2 py-3 text-muted-foreground">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Button type="button" variant="outline" onClick={() => void handleRevoke(key.id)}>
                        <Trash2 className="h-4 w-4" />
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SettingsCard>
    </div>
  );
}

export function SettingsPanel({ accessToken, activeTab, onTabChange, user }: SettingsPanelProps) {
  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold">Workspace administration</h1>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-panel">
        <TabBar activeTab={activeTab} onTabChange={onTabChange} />
        <div className="p-5">
          {activeTab === "api" ? <ApiSettingsTab accessToken={accessToken} /> : null}
          {activeTab === "billing" ? <BillingSettingsTab /> : null}
          {activeTab === "smtp" ? <SmtpSettingsTab accessToken={accessToken} /> : null}
          {activeTab === "email" ? <EmailActivityTab accessToken={accessToken} /> : null}
          {activeTab === "users" ? <UsersSettingsTab user={user} /> : null}
        </div>
      </div>
    </div>
  );
}
