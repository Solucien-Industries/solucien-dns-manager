import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MonitoringService } from "./monitoring.service";

@ApiTags("monitoring")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("monitoring")
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get()
  getStatus() {
    return this.monitoring.getStatus();
  }
}
