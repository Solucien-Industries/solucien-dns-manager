"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { listNotifications, markNotificationRead, type AppNotification } from "@/lib/api";

const KIND_STYLES: Record<string, string> = {
  WARNING: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  SUSPENSION: "border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-200",
  BAN: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200",
  API_KEY_LOCATION: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200",
  LOGIN_LOCATION: "border-yellow-500/40 bg-yellow-500/10 text-yellow-900 dark:text-yellow-100",
};

/** Shows the current user's unread moderation / security notices, dismissible. */
export function NotificationBanner({
  accessToken,
  onNavigateToApprovedLocations,
}: {
  accessToken: string;
  onNavigateToApprovedLocations?: () => void;
}) {
  const [items, setItems] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    try {
      const all = await listNotifications(accessToken);
      setItems(all.filter((item) => item.readAt === null));
    } catch {
      // best-effort — a missing API shouldn't break the dashboard
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function dismiss(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await markNotificationRead(accessToken, id);
    } catch {
      // if it fails it simply reappears on next load
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="mb-4 grid gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn("flex items-start gap-3 rounded-md border px-4 py-3", KIND_STYLES[item.kind] ?? KIND_STYLES.WARNING)}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="text-sm">{item.body}</p>
            {item.kind === "LOGIN_LOCATION" ? (
              <button
                type="button"
                onClick={onNavigateToApprovedLocations}
                className="mt-2 rounded px-2 py-1 text-xs font-semibold underline underline-offset-2 hover:bg-black/5 dark:hover:bg-white/10"
              >
                Review in Approved Locations
              </button>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => void dismiss(item.id)}
            className="shrink-0 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
