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

  constructor(private readonly prisma: PrismaService) {}

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

  async listActivity(filter: { userId?: string; tenantId?: string; limit?: number; cursor?: string }) {
    if (!this.prisma.connected) return { items: [], nextCursor: null };
    const take = clampLimit(filter.limit);
    const rows = await this.prisma.activityLog.findMany({
      where: {
        userId: filter.userId || undefined,
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

  async listLoginEvents(filter: { userId?: string; tenantId?: string; limit?: number; cursor?: string }) {
    if (!this.prisma.connected) return { items: [], nextCursor: null };
    const take = clampLimit(filter.limit);
    const rows = await this.prisma.loginEvent.findMany({
      where: {
        userId: filter.userId || undefined,
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

  private paginate<T extends { id: string }, R>(rows: T[], take: number, map: (row: T) => R) {
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map(map),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
