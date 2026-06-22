"use client";

import { useMemo, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InviteUserModal } from "@/components/dashboard/settings/invite-user-modal";
import {
  canManageMembers,
  createInvitedMember,
  ROLE_LABELS,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/lib/workspace-users";
import { cn } from "@/lib/utils";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

type UsersSettingsTabProps = {
  user: AuthUser | null;
};

export function UsersSettingsTab({ user }: UsersSettingsTabProps) {
  const isManager = canManageMembers(user?.role) || user?.email === "preview@solucien.local";
  const ownerId = user?.id ?? "owner";

  const [members, setMembers] = useState<WorkspaceMember[]>(() => [
    {
      id: ownerId,
      name: user?.name ?? "Preview User",
      email: user?.email ?? "preview@solucien.local",
      role: user?.email === "preview@solucien.local" ? "OWNER" : ((user?.role as WorkspaceRole) ?? "OWNER"),
      status: "active",
    },
  ]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (a.role === "OWNER" ? -1 : b.role === "OWNER" ? 1 : 0)),
    [members],
  );

  function handleInvite(input: { name: string; email: string; role: WorkspaceRole }) {
    setMembers((current) => [...current, createInvitedMember(input)]);
    setNotice(`Invitation sent to ${input.email}. Full delivery will be wired later.`);
  }

  function handleRoleChange(memberId: string, role: WorkspaceRole) {
    if (!isManager) return;
    setMembers((current) =>
      current.map((member) => (member.id === memberId && member.role !== "OWNER" ? { ...member, role } : member)),
    );
    setNotice("Role updated.");
  }

  function handleRemove(memberId: string) {
    if (!isManager) return;
    const target = members.find((member) => member.id === memberId);
    if (!target || target.role === "OWNER") return;
    setMembers((current) => current.filter((member) => member.id !== memberId));
    setNotice(`${target.email} removed from workspace.`);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-semibold">Team members</h3>
          <p className="text-sm text-muted-foreground">
            {isManager
              ? "Owners and admins can invite, change roles, and remove members."
              : "You can view workspace members. Contact an owner to manage access."}
          </p>
        </div>
        <Button disabled={!isManager} onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Invite user
        </Button>
      </div>

      {notice ? <p className="rounded-md border border-border bg-panel px-4 py-3 text-sm text-muted-foreground">{notice}</p> : null}

      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-bold uppercase tracking-normal text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              {isManager ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((member) => (
              <tr key={member.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 font-semibold">{member.name}</td>
                <td className="px-4 py-3">{member.email}</td>
                <td className="px-4 py-3">
                  {isManager && member.role !== "OWNER" ? (
                    <select
                      value={member.role}
                      onChange={(event) => handleRoleChange(member.id, event.target.value as WorkspaceRole)}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    >
                      {(["ADMIN", "MEMBER", "VIEWER"] as const).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABELS[member.role]
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-xs font-bold capitalize",
                      member.status === "active" ? "border-foreground" : "border-border text-muted-foreground",
                    )}
                  >
                    {member.status}
                  </span>
                </td>
                {isManager ? (
                  <td className="px-4 py-3 text-right">
                    {member.role !== "OWNER" ? (
                      <Button type="button" variant="outline" onClick={() => handleRemove(member.id)}>
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={handleInvite} />
    </div>
  );
}
