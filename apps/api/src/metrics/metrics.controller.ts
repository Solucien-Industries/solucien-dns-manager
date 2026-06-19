import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MetricsService } from "./metrics.service";

@ApiTags("metrics")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  getMetrics(@Req() req: Request) {
    const tenantId = (req.user as { tenantId?: string })?.tenantId;
    return this.metrics.getMetrics(tenantId);
  }
}
