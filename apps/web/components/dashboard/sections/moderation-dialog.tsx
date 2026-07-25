"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ModerationAction } from "@/lib/api";

type ModerationDialogProps = {
  open: boolean;
  action: Exclude<ModerationAction, "unsuspend" | "unban"> | null;
  targetEmail: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (input: { reason: string; expiresAt?: string; adminPassword: string }) => void;
};

const COPY: Record<string, { title: string; verb: string; danger: boolean }> = {
  warn: { title: "Issue a warning", verb: "Warn user", danger: false },
  suspend: { title: "Suspend account", verb: "Suspend user", danger: true },
  ban: { title: "Ban account", verb: "Ban user", danger: true },
};

export function ModerationDialog({
  open,
  action,
  targetEmail,
  submitting,
  onClose,
  onConfirm,
}: ModerationDialogProps) {
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Adjust state during render when the dialog opens for a new action,
  // instead of syncing via an Effect (see https://react.dev/learn/you-might-not-need-an-effect).
  const [prevKey, setPrevKey] = useState({ open, action });
  if (prevKey.open !== open || prevKey.action !== action) {
    setPrevKey({ open, action });
    if (open) {
      setReason("");
      setExpiresAt("");
      setAdminPassword("");
    }
  }

  if (!open || !action) return null;
  const copy = COPY[action];

  function handleSubmit() {
    const trimmed = reason.trim();
    if (trimmed.length < 3) return;
    onConfirm({
      reason: trimmed,
      expiresAt: action === "suspend" && expiresAt ? new Date(expiresAt).toISOString() : undefined,
      adminPassword,
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-md border border-border bg-panel p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This action affects <span className="font-semibold text-foreground">{targetEmail}</span> and notifies
          them by email and in-app.
        </p>

        <label className="mt-4 block text-sm font-semibold">Reason</label>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="Explain why this action is being taken (min 3 characters)."
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />

        {action === "suspend" ? (
          <>
            <label className="mt-4 block text-sm font-semibold">Suspend until (optional)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave empty for an indefinite suspension.</p>
          </>
        ) : null}

        <label className="mt-4 block text-sm font-semibold">Admin confirmation password</label>
        <input
          type="password"
          value={adminPassword}
          onChange={(event) => setAdminPassword(event.target.value)}
          placeholder="Enter admin moderation password"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className={cn(copy.danger && "bg-red-600 text-white hover:bg-red-600/90")}
            onClick={handleSubmit}
            disabled={submitting || reason.trim().length < 3 || adminPassword.trim().length === 0}
          >
            {submitting ? "Working…" : copy.verb}
          </Button>
        </div>
      </div>
    </div>
  );
}
