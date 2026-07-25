import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { Caller } from "../users/users.service";

export type AdminSummary = {
  id: string;
  email: string;
  name: string | null;
  status: "active";
};

export type AdminInviteSummary = {
  email: string;
  status: "invited";
  createdAt: string;
};

/**
 * Lets an existing platform admin grant ADMIN to another email — instantly if
 * that email already has an account, or as a pending invite (consumed on
 * first login) if it doesn't yet. See AuthService.resolveAdminGrant.
 */
@Injectable()
export class AdminInvitesService {
  constructor(private readonly prisma: PrismaService) { }

  async list(): Promise<{ admins: AdminSummary[]; invites: AdminInviteSummary[] }> {
    if (!this.prisma.connected) return { admins: [], invites: [] };

    const [admins, invites] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: "ADMIN" },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, name: true },
      }),
      this.prisma.adminInvite.findMany({ orderBy: { createdAt: "asc" } }),
    ]);

    return {
      admins: admins.map((admin) => ({ ...admin, status: "active" as const })),
      invites: invites.map((invite) => ({
        email: invite.email,
        status: "invited" as const,
        createdAt: invite.createdAt.toISOString(),
      })),
    };
  }

  /** Grant ADMIN to an email — immediately if the account exists, else as an invite. */
  async grant(caller: Caller, rawEmail: string): Promise<AdminSummary | AdminInviteSummary> {
    const email = rawEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new BadRequestException("Enter a valid email address.");
    }
    if (!this.prisma.connected) {
      throw new ForbiddenException("Account directory is unavailable.");
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      const updated = await this.prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
      return { id: updated.id, email: updated.email, name: updated.name, status: "active" };
    }

    const invite = await this.prisma.adminInvite.upsert({
      where: { email },
      update: {},
      create: { email, invitedById: caller.userId === "ephemeral" ? null : caller.userId },
    });
    return { email: invite.email, status: "invited", createdAt: invite.createdAt.toISOString() };
  }

  /** Revoke a not-yet-consumed invite. Existing admins are not demoted here. */
  async revokeInvite(email: string): Promise<{ revoked: true }> {
    if (!this.prisma.connected) {
      throw new ForbiddenException("Account directory is unavailable.");
    }
    await this.prisma.adminInvite.deleteMany({ where: { email: email.trim().toLowerCase() } });
    return { revoked: true };
  }
}
