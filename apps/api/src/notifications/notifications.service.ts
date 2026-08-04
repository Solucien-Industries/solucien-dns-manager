import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { NotificationKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type NotificationSummary = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist an in-app alert for a user. Best-effort: returns silently when the
   * DB is unavailable so the triggering action (moderation, key alert) succeeds.
   */
  async create(input: {
    userId: string;
    tenantId: string;
    kind: NotificationKind;
    title: string;
    body: string;
  }): Promise<void> {
    if (!this.prisma.connected) return;
    try {
      await this.prisma.notification.create({ data: input });
    } catch (err) {
      this.logger.error(`Failed to persist notification for ${input.userId}: ${(err as Error).message}`);
    }
  }

  /** Recent notifications for the current user, unread first. */
  async listForUser(userId: string, limit = 50): Promise<NotificationSummary[]> {
    if (!this.prisma.connected) return [];
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async markRead(id: string, userId: string): Promise<{ id: string; readAt: string }> {
    if (!this.prisma.connected) {
      return { id, readAt: new Date().toISOString() };
    }
    const existing = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("Notification not found.");
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: existing.readAt ?? new Date() },
    });
    return { id: updated.id, readAt: (updated.readAt ?? new Date()).toISOString() };
  }
}
