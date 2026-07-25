"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { MapPin, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  adminAccountActivity,
  adminActivity,
  adminApiKeyAlerts,
  adminListUsers,
  adminLoginEvents,
  adminModerate,
  adminModeration,
  createApprovedLocation,
  deleteApprovedLocation,
  listApprovedLocations,
  type AccountStatus,
  type AccountActivity,
  type ActivityEntry,
  type AdminUser,
  type ApiKeyAlert,
  type ApprovedLocation,
  type LoginEvent,
  type ModerationAction,
  type ModerationEvent,
} from "@/lib/api";
import { ModerationDialog } from "./moderation-dialog";

type AdminSectionProps = {
  accessToken: string;
  currentUserId: string | null;
  activeTab?: AdminTab;
  onTabChange?: (tab: AdminTab) => void;
};

export type AdminTab = "users" | "logins" | "activity" | "alerts" | "locations";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "users", label: "Accounts" },
  { id: "logins", label: "Login activity" },
  { id: "activity", label: "Audit log" },
  { id: "alerts", label: "API-key alerts" },
  { id: "locations", label: "Approved locations" },
];

const STATUS_STYLES: Record<AccountStatus, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  WARNED: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  SUSPENDED: "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400",
  BANNED: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400",
};

export function AdminSection({ accessToken, currentUserId, activeTab, onTabChange }: AdminSectionProps) {
  const [internalTab, setInternalTab] = useState<AdminTab>("users");
  const tab = activeTab ?? internalTab;

  function selectTab(next: AdminTab) {
    if (onTabChange) {
      onTabChange(next);
      return;
    }
    setInternalTab(next);
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-md border border-border bg-panel p-5 border-l-4 border-l-primary">
        <h1 className="text-2xl font-semibold text-foreground">Platform Admin Operations Console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor accounts across tenants, take moderation action, and review login and API-key activity.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-panel p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectTab(item.id)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-semibold transition",
              tab === item.id ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "users" ? <UsersTab accessToken={accessToken} currentUserId={currentUserId} /> : null}
      {tab === "logins" ? <LoginsTab accessToken={accessToken} /> : null}
      {tab === "activity" ? <ActivityTab accessToken={accessToken} /> : null}
      {tab === "alerts" ? <AlertsTab accessToken={accessToken} /> : null}
      {tab === "locations" ? <LocationsTab accessToken={accessToken} /> : null}
    </div>
  );
}

// --- shared bits -----------------------------------------------------------

function useAsync<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    loader()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loader, version]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setVersion((v) => v + 1);
  }, []);

  return { data, loading, error, refresh };
}

function SectionHeader({
  title,
  subtitle,
  onRefresh,
  loading,
}: {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <Button variant="outline" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-md border border-border bg-background">{children}</div>;
}

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

// --- Accounts tab ----------------------------------------------------------

function UsersTab({ accessToken, currentUserId }: { accessToken: string; currentUserId: string | null }) {
  const [query, setQuery] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [accountNumberFilter, setAccountNumberFilter] = useState("");
  const [creditCardIdFilter, setCreditCardIdFilter] = useState("");
  const { data, loading, error, refresh } = useAsync(
    useCallback(
      () =>
        adminListUsers(accessToken, {
          q: query,
          userId: userIdFilter,
          accountNumber: accountNumberFilter,
          creditCardId: creditCardIdFilter,
        }),
      [accessToken, query, userIdFilter, accountNumberFilter, creditCardIdFilter],
    ),
  );
  const [dialog, setDialog] = useState<{ user: AdminUser; action: "warn" | "suspend" | "ban" } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<ModerationEvent[] | null>(null);
  const [accountActivity, setAccountActivity] = useState<AccountActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  async function moderate(
    user: AdminUser,
    action: ModerationAction,
    input?: { reason?: string; expiresAt?: string; adminPassword?: string },
  ) {
    setSubmitting(true);
    try {
      await adminModerate(accessToken, user.id, action, input);
      setNotice(`${action} applied to ${user.email}.`);
      setDialog(null);
      if (historyFor === user.id) await loadHistory(user.id);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleHistory(userId: string) {
    if (historyFor === userId) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor(userId);
    await loadHistory(userId);
  }

  async function loadHistory(userId: string) {
    setHistory(null);
    try {
      setHistory(await adminModeration(accessToken, userId));
    } catch {
      setHistory([]);
    }
  }

  async function loadAccountActivity(input: { userId?: string; accountNumber?: string; creditCardId?: string }) {
    setActivityLoading(true);
    try {
      const next = await adminAccountActivity(accessToken, { ...input, limit: 100 });
      setAccountActivity(next);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not load account activity.");
      setAccountActivity(null);
    } finally {
      setActivityLoading(false);
    }
  }

  return (
    <div className="grid gap-3">
      <SectionHeader
        title="Accounts"
        subtitle="Every account across tenants. Warn, suspend, or ban users — each notifies them by email and in-app."
        onRefresh={refresh}
        loading={loading}
      />
      {notice ? (
        <p className="rounded-md border border-border bg-panel px-4 py-2 text-sm text-muted-foreground">{notice}</p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-2 rounded-md border border-border bg-panel p-3 md:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name/email/id"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        />
        <input
          value={userIdFilter}
          onChange={(event) => setUserIdFilter(event.target.value)}
          placeholder="Filter by user ID"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        />
        <input
          value={accountNumberFilter}
          onChange={(event) => setAccountNumberFilter(event.target.value)}
          placeholder="Filter by account number"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        />
        <input
          value={creditCardIdFilter}
          onChange={(event) => setCreditCardIdFilter(event.target.value)}
          placeholder="Filter by credit card ID"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        />
      </div>

      <Panel>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-bold uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Account IDs</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((user) => (
              <Fragment key={user.id}>
                <tr className="border-b border-border align-top last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{user.name ?? user.email}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <p>{user.accountNumber ?? "—"}</p>
                    <p>{user.creditCardId ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3">{user.tenantName ?? user.tenantId}</td>
                  <td className="px-4 py-3">{user.role}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded border px-2 py-0.5 text-xs font-bold", STATUS_STYLES[user.status])}>
                      {user.status}
                    </span>
                    {user.statusReason ? (
                      <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{user.statusReason}</p>
                    ) : null}
                    {user.suspendedUntil ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">until {fmt(user.suspendedUntil)}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={() => void toggleHistory(user.id)}
                      >
                        {historyFor === user.id ? "Hide" : "History"}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        onClick={() =>
                          void loadAccountActivity({
                            userId: user.id,
                            accountNumber: user.accountNumber ?? undefined,
                            creditCardId: user.creditCardId ?? undefined,
                          })
                        }
                      >
                        Open Activity
                      </Button>
                      {user.id === currentUserId ? (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {user.status !== "BANNED" ? (
                            <>
                              <Button variant="outline" className="h-8 px-2 text-xs" onClick={() => setDialog({ user, action: "warn" })}>
                                Warn
                              </Button>
                              {user.status === "SUSPENDED" ? (
                                <Button variant="outline" className="h-8 px-2 text-xs" onClick={() => moderate(user, "unsuspend")}>
                                  Unsuspend
                                </Button>
                              ) : (
                                <Button variant="outline" className="h-8 px-2 text-xs" onClick={() => setDialog({ user, action: "suspend" })}>
                                  Suspend
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                className="h-8 border-red-500/40 px-2 text-xs text-red-600 hover:bg-red-500/10"
                                onClick={() => setDialog({ user, action: "ban" })}
                              >
                                Ban
                              </Button>
                            </>
                          ) : (
                            <Button variant="outline" className="h-8 px-2 text-xs" onClick={() => moderate(user, "unban")}>
                              Unban
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
                {historyFor === user.id ? (
                  <tr className="border-b border-border bg-panel/60 last:border-b-0">
                    <td colSpan={6} className="px-4 py-3">
                      {history === null ? (
                        <p className="text-xs text-muted-foreground">Loading history…</p>
                      ) : history.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No moderation history for this account.</p>
                      ) : (
                        <ul className="grid gap-1.5">
                          {history.map((event) => (
                            <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                              <span className="font-mono font-semibold">{event.action}</span>
                              <span className="text-muted-foreground">{fmt(event.createdAt)}</span>
                              {event.expiresAt ? (
                                <span className="text-muted-foreground">→ until {fmt(event.expiresAt)}</span>
                              ) : null}
                              <span className="w-full text-muted-foreground sm:w-auto">{event.reason}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {!loading && (data ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No accounts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>

      <div className="rounded-md border border-border bg-panel p-4">
        <h3 className="text-sm font-semibold">Selected Account Activity</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Click Open Activity on any account row, or use the filters above to narrow by user ID, account number, or credit card ID.
        </p>
        {activityLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading account activity…</p> : null}
        {!activityLoading && accountActivity?.account ? (
          <div className="mt-3 grid gap-3">
            <div className="rounded-md border border-border bg-background p-3 text-sm">
              <p className="font-semibold">{accountActivity.account.name ?? accountActivity.account.email}</p>
              <p className="text-xs text-muted-foreground">{accountActivity.account.email}</p>
              <p className="mt-1 font-mono text-xs">user: {accountActivity.account.id}</p>
              <p className="font-mono text-xs">acct: {accountActivity.account.accountNumber ?? "—"}</p>
              <p className="font-mono text-xs">card: {accountActivity.account.creditCardId ?? "—"}</p>
            </div>

            <div className="grid gap-2 lg:grid-cols-2">
              <Panel>
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Login events</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountActivity.loginEvents.map((event) => (
                      <tr key={event.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2">{fmt(event.createdAt)}</td>
                        <td className="px-3 py-2">{[event.city, event.region, event.country].filter(Boolean).join(", ") || event.ip}</td>
                        <td className="px-3 py-2 font-mono">{event.outcome}</td>
                      </tr>
                    ))}
                    {accountActivity.loginEvents.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-muted-foreground">No login activity found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </Panel>

              <Panel>
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Audit events</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountActivity.activity.map((entry) => (
                      <tr key={entry.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2">{fmt(entry.createdAt)}</td>
                        <td className="px-3 py-2 font-mono">{entry.method} {entry.path}</td>
                        <td className="px-3 py-2 font-mono">{entry.statusCode}</td>
                      </tr>
                    ))}
                    {accountActivity.activity.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-muted-foreground">No audit activity found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </Panel>
            </div>
          </div>
        ) : null}
      </div>

      <ModerationDialog
        open={dialog !== null}
        action={dialog?.action ?? null}
        targetEmail={dialog?.user.email ?? ""}
        submitting={submitting}
        onClose={() => setDialog(null)}
        onConfirm={(input) => dialog && moderate(dialog.user, dialog.action, input)}
      />
    </div>
  );
}

// --- Login activity tab ----------------------------------------------------

function LoginsTab({ accessToken }: { accessToken: string }) {
  const { data, loading, error, refresh } = useAsync(useCallback(() => adminLoginEvents(accessToken), [accessToken]));
  const events: LoginEvent[] = data?.items ?? [];

  return (
    <div className="grid gap-3">
      <SectionHeader
        title="Login activity"
        subtitle="Where users signed in from, including blocked attempts by suspended or banned accounts."
        onRefresh={refresh}
        loading={loading}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Panel>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-bold uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 whitespace-nowrap">{fmt(event.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-xs">{event.userId}</td>
                <td className="px-4 py-3 font-mono text-xs">{event.ip}</td>
                <td className="px-4 py-3">{[event.city, event.region, event.country].filter(Boolean).join(", ") || "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-xs font-bold",
                      event.outcome === "SUCCESS"
                        ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "border-red-500/30 text-red-600 dark:text-red-400",
                    )}
                  >
                    {event.outcome}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No login events yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// --- Audit log tab ---------------------------------------------------------

function ActivityTab({ accessToken }: { accessToken: string }) {
  const { data, loading, error, refresh } = useAsync(useCallback(() => adminActivity(accessToken), [accessToken]));
  const rows: ActivityEntry[] = data?.items ?? [];

  return (
    <div className="grid gap-3">
      <SectionHeader
        title="Audit log"
        subtitle="What users did after logging in (mutations and errors across the API)."
        onRefresh={refresh}
        loading={loading}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Panel>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-bold uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 whitespace-nowrap">{fmt(row.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.userId ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {row.method} {row.path}
                </td>
                <td className="px-4 py-3">
                  <span className={cn("font-mono text-xs", row.statusCode >= 400 ? "text-red-600" : "text-muted-foreground")}>
                    {row.statusCode}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{row.ip ?? "—"}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No activity recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// --- API-key alerts tab ----------------------------------------------------

function AlertsTab({ accessToken }: { accessToken: string }) {
  const { data, loading, error, refresh } = useAsync(useCallback(() => adminApiKeyAlerts(accessToken), [accessToken]));
  const rows: ApiKeyAlert[] = data?.items ?? [];

  return (
    <div className="grid gap-3">
      <SectionHeader
        title="API-key location alerts"
        subtitle="API keys used from outside a tenant's approved locations. Owners/admins are also emailed."
        onRefresh={refresh}
        loading={loading}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Panel>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-bold uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Path</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 whitespace-nowrap">{fmt(row.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.tenantId}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.apiKeyId}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.ip}</td>
                <td className="px-4 py-3">{row.country ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.path ?? "—"}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  <ShieldAlert className="mx-auto mb-2 h-5 w-5 text-emerald-500" />
                  No unapproved API-key usage detected.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// --- Approved locations tab ------------------------------------------------

function LocationsTab({ accessToken }: { accessToken: string }) {
  const { data, loading, error, refresh } = useAsync(useCallback(() => listApprovedLocations(accessToken), [accessToken]));
  const [type, setType] = useState<"COUNTRY" | "CIDR">("COUNTRY");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [approvalSecret, setApprovalSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function add() {
    if (!value.trim() || !approvalSecret.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      await createApprovedLocation(accessToken, {
        type,
        value: value.trim(),
        label: label.trim() || undefined,
        approvalSecret: approvalSecret.trim(),
      });
      setValue("");
      setLabel("");
      setApprovalSecret("");
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add rule.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setFormError(null);
    try {
      await deleteApprovedLocation(accessToken, id);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not remove rule.");
    }
  }

  const rules: ApprovedLocation[] = data ?? [];

  return (
    <div className="grid gap-3">
      <SectionHeader
        title="Approved locations"
        subtitle="Restrict where your tenant's API keys may be used. With no rules, enforcement is off (all locations allowed)."
        onRefresh={refresh}
        loading={loading}
      />

      <div className="rounded-md border border-border bg-panel p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold uppercase text-muted-foreground">Type</label>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as "COUNTRY" | "CIDR")}
              className="mt-1 h-10 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="COUNTRY">Country</option>
              <option value="CIDR">IP range (CIDR)</option>
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold uppercase text-muted-foreground">
              {type === "COUNTRY" ? "Country code" : "CIDR range"}
            </label>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={type === "COUNTRY" ? "CD" : "203.0.113.0/24"}
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold uppercase text-muted-foreground">Label (optional)</label>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Kinshasa office"
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-bold uppercase text-muted-foreground">Password or passkey</label>
            <input
              type="password"
              value={approvalSecret}
              onChange={(event) => setApprovalSecret(event.target.value)}
              placeholder="Confirm before trusting location"
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            />
          </div>
          <Button onClick={add} disabled={busy || !value.trim() || !approvalSecret.trim()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          For security, adding a trusted location requires your location approval password/passkey.
        </p>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Panel>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-bold uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {rule.type}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{rule.value}</td>
                <td className="px-4 py-3 text-muted-foreground">{rule.label ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" className="h-8 px-2 text-xs" onClick={() => void remove(rule.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && rules.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No location rules — API keys may be used from anywhere.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
