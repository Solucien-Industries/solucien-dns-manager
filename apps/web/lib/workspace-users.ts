export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type WorkspaceMember = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: "active" | "invited";
};

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export function canManageMembers(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function createInvitedMember(input: { name: string; email: string; role: WorkspaceRole }): WorkspaceMember {
  return {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    status: "invited",
  };
}
