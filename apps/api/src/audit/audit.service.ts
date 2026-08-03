import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type ActivityEntry = {
  userId?: string | null;
  tenantId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  ip?: string | null;
  durationMs?: number | null;
};

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

type ActivityFilter = {
  userId?: string;
  tenantId?: string;
  accountNumber?: string;
  creditCardId?: string;
  limit?: number;
  cursor?: string;
};

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
}

/**
 * Persists and reads the API activity/audit trail and login-event history.
 * Writes are best-effort (fire-and-forget from the interceptor) and no-op when
 * the DB is unavailable so requests are never coupled to audit availability.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) { }

  async record(entry: ActivityEntry): Promise<void> {
    if (!this.prisma.connected) return;
    try {
      await this.prisma.activityLog.create({
        data: {
          userId: entry.userId ?? null,
          tenantId: entry.tenantId ?? null,
          method: entry.method,
          path: entry.path,
          statusCode: entry.statusCode,
          ip: entry.ip ?? null,
          durationMs: entry.durationMs ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write activity log: ${(err as Error).message}`);
    }
  }

  async listActivity(filter: ActivityFilter) {
    if (!this.prisma.connected) return { items: [], nextCursor: null };
    const userFilter = await this.resolveUserFilter(filter);
    if (userFilter === null) return { items: [], nextCursor: null };
    const take = clampLimit(filter.limit);
    const rows = await this.prisma.activityLog.findMany({
      where: {
        userId: userFilter,
        tenantId: filter.tenantId || undefined,
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    return this.paginate(rows, take, (row) => ({
      id: row.id,
      userId: row.userId,
      tenantId: row.tenantId,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      ip: row.ip,
      durationMs: row.durationMs,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listLoginEvents(filter: ActivityFilter) {
    if (!this.prisma.connected) return { items: [], nextCursor: null };
    const userFilter = await this.resolveUserFilter(filter);
    if (userFilter === null) return { items: [], nextCursor: null };
    const take = clampLimit(filter.limit);
    const rows = await this.prisma.loginEvent.findMany({
      where: {
        userId: userFilter,
        tenantId: filter.tenantId || undefined,
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    return this.paginate(rows, take, (row) => ({
      id: row.id,
      userId: row.userId,
      tenantId: row.tenantId,
      ip: row.ip,
      country: row.country,
      region: row.region,
      city: row.city,
      userAgent: row.userAgent,
      outcome: row.outcome,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listAccountActivity(filter: {
    userId?: string;
    accountNumber?: string;
    creditCardId?: string;
    limit?: number;
  }) {
    if (!this.prisma.connected) return { account: null, loginEvents: [], activity: [] };
    const userIds = await this.resolveUserIds(filter.userId, filter.accountNumber, filter.creditCardId);
    if (userIds.length === 0) return { account: null, loginEvents: [], activity: [] };

    const primaryUserId = filter.userId?.trim() || userIds[0];
    const account = await this.prisma.user.findUnique({ where: { id: primaryUserId } });
    const take = clampLimit(filter.limit);

    const [loginRows, activityRows] = await Promise.all([
      this.prisma.loginEvent.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: "desc" },
        take,
      }),
      this.prisma.activityLog.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: "desc" },
        take,
      }),
    ]);

    return {
      account: account
        ? {
          id: account.id,
          email: account.email,
          name: account.name,
          tenantId: account.tenantId,
          accountNumber: account.accountNumber,
          creditCardId: account.creditCardId,
        }
        : null,
      loginEvents: loginRows.map((row) => ({
        id: row.id,
        userId: row.userId,
        tenantId: row.tenantId,
        ip: row.ip,
        country: row.country,
        region: row.region,
        city: row.city,
        userAgent: row.userAgent,
        outcome: row.outcome,
        createdAt: row.createdAt.toISOString(),
      })),
      activity: activityRows.map((row) => ({
        id: row.id,
        userId: row.userId,
        tenantId: row.tenantId,
        method: row.method,
        path: row.path,
        statusCode: row.statusCode,
        ip: row.ip,
        durationMs: row.durationMs,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private async resolveUserFilter(filter: ActivityFilter): Promise<string | { in: string[] } | undefined | null> {
    if (filter.userId?.trim()) return filter.userId.trim();
    if (!filter.accountNumber?.trim() && !filter.creditCardId?.trim()) return undefined;
    const userIds = await this.resolveUserIds(undefined, filter.accountNumber, filter.creditCardId);
    if (userIds.length === 0) return null;
    return { in: userIds };
  }

  private async resolveUserIds(
    userId?: string,
    accountNumber?: string,
    creditCardId?: string,
  ): Promise<string[]> {
    if (userId?.trim()) return [userId.trim()];
    const where: { accountNumber?: string; creditCardId?: string } = {};
    if (accountNumber?.trim()) where.accountNumber = accountNumber.trim();
    if (creditCardId?.trim()) where.creditCardId = creditCardId.trim();
    if (!where.accountNumber && !where.creditCardId) return [];
    const users = await this.prisma.user.findMany({ where, select: { id: true } });
    return users.map((user) => user.id);
  }

  private paginate<T extends { id: string }, R>(rows: T[], take: number, map: (row: T) => R) {
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map(map),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
