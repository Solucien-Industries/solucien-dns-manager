"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type WorkspaceRole } from "@/lib/workspace-users";

type InviteUserModalProps = {
  open: boolean;
  onClose: () => void;
  onInvite: (input: { name: string; email: string; role: WorkspaceRole }) => void;
};

export function InviteUserModal({ open, onClose, onInvite }: InviteUserModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("MEMBER");

  if (!open) return null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onInvite({ name, email, role });
    setName("");
    setEmail("");
    setRole("MEMBER");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-md border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Invite team member</h2>
          <Button variant="ghost" className="h-10 w-10 px-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form className="grid gap-4 p-5" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-semibold">
            Full name
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Ops" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Email
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="jane@company.com" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceRole)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              {(["ADMIN", "MEMBER", "VIEWER"] as const).map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Send invite</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
