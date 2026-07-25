import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { ModerationAction, User, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { Caller } from "../users/users.service";

/** Platform-wide moderation is restricted to ADMIN; OWNER is tenant-scoped. */
function isManager(role: string | undefined): boolean {
  return role === "ADMIN";
}

export type ModerationEventSummary = {
  id: string;
  action: ModerationAction;
  reason: string;
  actorId: string | null;
  expiresAt: string | null;
  createdAt: string;
};

/**
 * Platform moderation: warn / suspend / ban a user (and reverse those actions).
 * Every action writes an audit ModerationEvent, flips the denormalized
 * User.status used by the login gate, files an in-app Notification, and emails
 * the affected user. Email/notification are best-effort and never block the action.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly moderationPassword =
    process.env.ADMIN_MODERATION_PASSWORD ?? process.env.ADMIN_ACTION_PASSWORD ?? null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) { }

  async warn(caller: Caller, targetId: string, reason: string, adminPassword: string) {
    const target = await this.authorize(caller, targetId);
    this.assertModerationPassword(adminPassword);
    await this.apply(caller, target, "WARN", "WARNED", reason);
    void this.mail.sendWarning(target.email, reason);
    await this.notify(target, "WARNING", "Account warning", reason);
    return this.currentStatus(target.id);
  }

  async suspend(caller: Caller, targetId: string, reason: string, adminPassword: string, expiresAt?: Date | null) {
    const target = await this.authorize(caller, targetId);
    this.assertModerationPassword(adminPassword);
    await this.apply(caller, target, "SUSPEND", "SUSPENDED", reason, expiresAt ?? null);
    void this.mail.sendSuspension(target.email, reason, expiresAt ?? null);
    await this.notify(
      target,
      "SUSPENSION",
      "Account suspended",
      expiresAt ? `${reason} (until ${expiresAt.toISOString()})` : reason,
    );
    return this.currentStatus(target.id);
  }

  async ban(caller: Caller, targetId: string, reason: string, adminPassword: string) {
    const target = await this.authorize(caller, targetId);
    this.assertModerationPassword(adminPassword);
    await this.apply(caller, target, "BAN", "BANNED", reason);
    void this.mail.sendBan(target.email, reason);
    await this.notify(target, "BAN", "Account banned", reason);
    return this.currentStatus(target.id);
  }

  async unsuspend(caller: Caller, targetId: string) {
    const target = await this.authorize(caller, targetId);
    await this.apply(caller, target, "UNSUSPEND", "ACTIVE", "Suspension lifted", null);
    return this.currentStatus(target.id);
  }

  async unban(caller: Caller, targetId: string) {
    const target = await this.authorize(caller, targetId);
    await this.apply(caller, target, "UNBAN", "ACTIVE", "Ban lifted", null);
    return this.currentStatus(target.id);
  }

  async history(caller: Caller, targetId: string): Promise<ModerationEventSummary[]> {
    if (!isManager(caller.role)) {
      throw new ForbiddenException("Only platform admins can view moderation history.");
    }
    if (!this.prisma.connected) return [];
    const rows = await this.prisma.moderationEvent.findMany({
      where: { targetId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason,
      actorId: row.actorId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Shared write: audit event + status flip in one transaction. */
  private async apply(
    caller: Caller,
    target: User,
    action: ModerationAction,
    status: UserStatus,
    reason: string,
    expiresAt: Date | null = null,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.moderationEvent.create({
        data: {
          action,
          reason,
          targetId: target.id,
          actorId: caller.userId === "ephemeral" ? null : caller.userId,
          expiresAt,
        },
      }),
      this.prisma.user.update({
        where: { id: target.id },
        data: {
          status,
          statusReason: status === "ACTIVE" ? null : reason,
          suspendedUntil: status === "SUSPENDED" ? expiresAt : null,
          statusUpdatedAt: new Date(),
        },
      }),
    ]);
    this.logger.log(`${action} applied to ${target.email} by ${caller.email}`);
  }

  private async notify(target: User, kind: "WARNING" | "SUSPENSION" | "BAN", title: string, body: string) {
    await this.notifications.create({
      userId: target.id,
      tenantId: target.tenantId,
      kind,
      title,
      body,
    });
  }

  /** Load the target, enforce manager gating + self protection. */
  private async authorize(caller: Caller, targetId: string): Promise<User> {
    if (!isManager(caller.role)) {
      throw new ForbiddenException("Only platform admins can moderate accounts.");
    }
    if (!this.prisma.connected) {
      throw new ServiceUnavailableException("Account directory is unavailable.");
    }
    if (targetId === caller.userId) {
      throw new ForbiddenException("You cannot moderate your own account.");
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException("Account not found.");
    return target;
  }

  private async currentStatus(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return {
      id,
      status: user?.status ?? "ACTIVE",
      statusReason: user?.statusReason ?? null,
      suspendedUntil: user?.suspendedUntil?.toISOString() ?? null,
    };
  }

  private assertModerationPassword(input: string): void {
    if (!this.moderationPassword) {
      throw new ServiceUnavailableException("Moderation password is not configured.");
    }
    if (!safeConstantCompare(input, this.moderationPassword)) {
      throw new ForbiddenException("Invalid moderation password.");
    }
  }
}

function safeConstantCompare(input: string, expected: string): boolean {
  const left = Buffer.from(input, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
