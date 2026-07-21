import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import ipaddr from "ipaddr.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ManagerGuard } from "../common/manager.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CreateApprovedLocationDto } from "./dto/create-approved-location.dto";
import { LocationService } from "./location.service";

/**
 * Tenant-scoped CRUD for API-key approved locations. Every operation is bound to
 * the caller's own tenant (from the JWT), so managers can only edit their rules.
 */
@ApiTags("approved-locations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagerGuard)
@Controller("tenant/approved-locations")
export class ApprovedLocationsController {
  private readonly locationApprovalSecret =
    process.env.LOCATION_APPROVAL_PASSKEY ??
    process.env.LOCATION_APPROVAL_PASSWORD ??
    process.env.ADMIN_MODERATION_PASSWORD ??
    process.env.ADMIN_ACTION_PASSWORD ??
    null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationService,
  ) { }

  @Get()
  async list(@Req() req: Request) {
    if (!this.prisma.connected) return [];
    const tenantId = tenantOf(req);
    const rows = await this.prisma.approvedLocation.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      value: row.value,
      label: row.label,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  @Post()
  async create(@Body() dto: CreateApprovedLocationDto, @Req() req: Request) {
    if (!this.prisma.connected) {
      throw new ServiceUnavailableException("Location rules are unavailable.");
    }
    this.assertLocationApprovalSecret(dto.approvalSecret);
    const value = normaliseValue(dto);
    const tenantId = tenantOf(req);
    const created = await this.prisma.approvedLocation.create({
      data: { tenantId, type: dto.type, value, label: dto.label ?? null },
    });
    await this.locations.invalidate(tenantId);
    return {
      id: created.id,
      type: created.type,
      value: created.value,
      label: created.label,
      createdAt: created.createdAt.toISOString(),
    };
  }

  private assertLocationApprovalSecret(input: string): void {
    if (!this.locationApprovalSecret) {
      throw new ServiceUnavailableException("Location approval passkey is not configured.");
    }
    if (!safeConstantCompare(input, this.locationApprovalSecret)) {
      throw new BadRequestException("Invalid location approval password or passkey.");
    }
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    if (!this.prisma.connected) {
      throw new ServiceUnavailableException("Location rules are unavailable.");
    }
    const tenantId = tenantOf(req);
    const existing = await this.prisma.approvedLocation.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Location rule not found.");
    await this.prisma.approvedLocation.delete({ where: { id } });
    await this.locations.invalidate(tenantId);
    return { deleted: true, id };
  }
}

function safeConstantCompare(input: string, expected: string): boolean {
  const left = Buffer.from(input, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function tenantOf(req: Request): string {
  return (req.user as { tenantId?: string })?.tenantId ?? "ephemeral-tenant";
}

/** Validate + canonicalise the rule value per its type. */
function normaliseValue(dto: CreateApprovedLocationDto): string {
  const raw = dto.value.trim();
  if (dto.type === "COUNTRY") {
    if (!/^[A-Za-z]{2}$/.test(raw)) {
      throw new BadRequestException("Country must be a 2-letter ISO code (e.g. CD).");
    }
    return raw.toUpperCase();
  }
  try {
    ipaddr.parseCIDR(raw); // throws if malformed
    return raw;
  } catch {
    throw new BadRequestException("CIDR must look like 203.0.113.0/24 or 2001:db8::/32.");
  }
}
