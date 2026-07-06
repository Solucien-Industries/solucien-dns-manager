import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type Caller = {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
};

export type AccountSummary = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
  provider: string | null;
  createdAt: string | null;
  isSelf: boolean;
};

export type AdminAccountSummary = AccountSummary & {
  status: string;
  statusReason: string | null;
  suspendedUntil: string | null;
  tenantName: string | null;
};

/** Owners and platform admins may view and remove other accounts. */
function isManager(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Managers (owner/admin) see every account; regular members only see
   * themselves. Returns an empty-ish self record when the DB is unavailable so
   * the settings screen still renders in preview/local mode.
   */
  async list(caller: Caller): Promise<AccountSummary[]> {
    if (!this.prisma.connected) {
      return [
        {
          id: caller.userId,
          email: caller.email,
          name: null,
          role: caller.role,
          tenantId: caller.tenantId,
          provider: null,
          createdAt: null,
          isSelf: true,
        },
      ];
    }

    const rows = await this.prisma.user.findMany({
      where: isManager(caller.role) ? undefined : { id: caller.userId },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      tenantId: row.tenantId,
      provider: row.provider,
      createdAt: row.createdAt.toISOString(),
      isSelf: row.id === caller.userId,
    }));
  }

  /**
   * Platform-admin view of every account with moderation status. Restricted to
   * owners/admins (the admin console guards this too, but defend in depth).
   */
  async adminList(caller: Caller): Promise<AdminAccountSummary[]> {
    if (!isManager(caller.role)) {
      throw new ForbiddenException("Only owners and admins can view all accounts.");
    }
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { tenant: { select: { name: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      tenantId: row.tenantId,
      tenantName: row.tenant?.name ?? null,
      provider: row.provider,
      createdAt: row.createdAt.toISOString(),
      isSelf: row.id === caller.userId,
      status: row.status,
      statusReason: row.statusReason,
      suspendedUntil: row.suspendedUntil?.toISOString() ?? null,
    }));
  }

  /** Delete the caller's own account. Always allowed for an authenticated user. */
  async deleteOwn(caller: Caller): Promise<{ deleted: true; id: string }> {
    if (!this.prisma.connected) {
      // Nothing persisted (preview/ephemeral identity) — treat as success so the
      // web client can clear the session and sign the user out.
      return { deleted: true, id: caller.userId };
    }

    const existing = await this.prisma.user.findUnique({ where: { id: caller.userId } });
    if (!existing) {
      // Token references a user that no longer exists; deletion is idempotent.
      return { deleted: true, id: caller.userId };
    }

    await this.prisma.user.delete({ where: { id: caller.userId } });
    this.logger.log(`Account self-deleted: ${existing.email}`);
    return { deleted: true, id: caller.userId };
  }

  /** Delete another account by id. Restricted to owners/admins. */
  async deleteById(caller: Caller, targetId: string): Promise<{ deleted: true; id: string }> {
    if (!isManager(caller.role)) {
      throw new ForbiddenException("Only owners and admins can delete other accounts.");
    }

    if (targetId === caller.userId) {
      // Self-deletion goes through the explicit /me route so it's never accidental.
      throw new ForbiddenException("Use the delete-my-account action to remove your own account.");
    }

    if (!this.prisma.connected) {
      throw new NotFoundException("Account directory is unavailable.");
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException("Account not found.");
    }

    if (target.role === "OWNER" && caller.role !== "OWNER") {
      throw new ForbiddenException("Only an owner can delete an owner account.");
    }

    await this.prisma.user.delete({ where: { id: targetId } });
    this.logger.log(`Account ${target.email} deleted by ${caller.email}`);
    return { deleted: true, id: targetId };
  }
}
