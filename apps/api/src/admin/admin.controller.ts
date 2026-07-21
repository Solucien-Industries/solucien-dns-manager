import { Controller, Get, Param, Post, Body, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { callerFrom } from "../common/request-caller";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { UsersService } from "../users/users.service";
import { AdminGuard } from "./admin.guard";
import { ModerationService } from "./moderation.service";
import { BanDto, SuspendDto, WarnDto } from "./dto/moderation.dto";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly moderation: ModerationService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) { }

  /** All accounts across tenants with moderation status. */
  @Get("users")
  listUsers(
    @Req() req: Request,
    @Query("q") q?: string,
    @Query("userId") userId?: string,
    @Query("accountNumber") accountNumber?: string,
    @Query("creditCardId") creditCardId?: string,
  ) {
    return this.users.adminList(callerFrom(req), { q, userId, accountNumber, creditCardId });
  }

  @Post("users/:id/warn")
  warn(@Param("id") id: string, @Body() dto: WarnDto, @Req() req: Request) {
    return this.moderation.warn(callerFrom(req), id, dto.reason, dto.adminPassword);
  }

  @Post("users/:id/suspend")
  suspend(@Param("id") id: string, @Body() dto: SuspendDto, @Req() req: Request) {
    return this.moderation.suspend(
      callerFrom(req),
      id,
      dto.reason,
      dto.adminPassword,
      dto.expiresAt ? new Date(dto.expiresAt) : null,
    );
  }

  @Post("users/:id/ban")
  ban(@Param("id") id: string, @Body() dto: BanDto, @Req() req: Request) {
    return this.moderation.ban(callerFrom(req), id, dto.reason, dto.adminPassword);
  }

  @Post("users/:id/unsuspend")
  unsuspend(@Param("id") id: string, @Req() req: Request) {
    return this.moderation.unsuspend(callerFrom(req), id);
  }

  @Post("users/:id/unban")
  unban(@Param("id") id: string, @Req() req: Request) {
    return this.moderation.unban(callerFrom(req), id);
  }

  @Get("users/:id/moderation")
  history(@Param("id") id: string, @Req() req: Request) {
    return this.moderation.history(callerFrom(req), id);
  }

  @Get("login-events")
  loginEvents(
    @Query("userId") userId?: string,
    @Query("tenantId") tenantId?: string,
    @Query("accountNumber") accountNumber?: string,
    @Query("creditCardId") creditCardId?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.audit.listLoginEvents({
      userId,
      tenantId,
      accountNumber,
      creditCardId,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get("activity")
  activity(
    @Query("userId") userId?: string,
    @Query("tenantId") tenantId?: string,
    @Query("accountNumber") accountNumber?: string,
    @Query("creditCardId") creditCardId?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.audit.listActivity({
      userId,
      tenantId,
      accountNumber,
      creditCardId,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get("account-activity")
  accountActivity(
    @Query("userId") userId?: string,
    @Query("accountNumber") accountNumber?: string,
    @Query("creditCardId") creditCardId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.audit.listAccountActivity({
      userId,
      accountNumber,
      creditCardId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** API keys used outside a tenant's approved locations. */
  @Get("api-key-alerts")
  async apiKeyAlerts(@Query("tenantId") tenantId?: string, @Query("limit") limit?: string) {
    if (!this.prisma.connected) return { items: [] };
    const take = Math.min(Math.max(1, Number(limit) || 50), 200);
    const rows = await this.prisma.apiKeyUsageEvent.findMany({
      where: { approved: false, tenantId: tenantId || undefined },
      orderBy: { createdAt: "desc" },
      take,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        apiKeyId: row.apiKeyId,
        tenantId: row.tenantId,
        ip: row.ip,
        country: row.country,
        path: row.path,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
