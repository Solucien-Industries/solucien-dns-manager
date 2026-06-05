import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOkResponse } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { PowerDnsService } from "../powerdns/powerdns.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdns: PowerDnsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Liveness and dependency status." })
  check() {
    return {
      status: "ok",
      service: "solucien-dns-manager-api",
      dependencies: {
        database: this.prisma.connected ? "connected" : "fallback",
        powerdns: this.pdns.configured ? "configured" : "not-configured",
      },
    };
  }
}
