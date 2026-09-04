import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ReputationService } from "./reputation.service";
import { SendingDomainService } from "./sending-domain.service";

/**
 * Story 12: reputation visibility and manual suspension.
 *
 * SES event ingestion lives on MessagesController (`POST /api/messages/events/ses`)
 * — there is deliberately only one ingestion path, because two would double-count
 * bounces and skew the automatic suspension thresholds.
 */
@ApiTags("smtp")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("smtp/reputation")
export class ReputationController {
  constructor(
    private readonly reputation: ReputationService,
    private readonly sendingDomains: SendingDomainService,
  ) {}

  /** Bounce and complaint rates per domain over the trailing window. */
  @Get()
  snapshot(@Req() req: Request, @Query("hours") hours?: string) {
    const user = req.user as { tenantId?: string };
    return this.reputation.snapshot(user.tenantId ?? "ephemeral-tenant", Number(hours ?? 24));
  }

  /**
   * Stop a domain sending. Reversible, and leaves DKIM verification intact, so
   * a customer who fixes their list can be reinstated without redoing setup.
   */
  @Post(":domain/suspend")
  suspend(@Param("domain") domain: string, @Req() req: Request, @Body() body: { reason?: string } = {}) {
    const user = req.user as { tenantId?: string };
    return this.sendingDomains.setOperationalStatus(
      domain,
      user.tenantId ?? "ephemeral-tenant",
      "SUSPENDED",
      body.reason ?? "Suspended by an administrator.",
    );
  }

  /** Reinstate a suspended domain. */
  @Post(":domain/resume")
  resume(@Param("domain") domain: string, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.sendingDomains.setOperationalStatus(domain, user.tenantId ?? "ephemeral-tenant", "ACTIVE");
  }
}
