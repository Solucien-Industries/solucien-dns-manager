import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { DomainsService } from "./domains.service";
import { CreateDomainDto } from "./dto/create-domain.dto";
import { JwtOrApiKeyGuard } from "../api-keys/jwt-or-api-key.guard";

@ApiTags("domains")
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyGuard)
@Controller("domains")
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  findAll(@Req() req: Request) {
    return this.domains.findAll((req.user as { tenantId: string }).tenantId);
  }

  @Get(":name/export")
  exportZone(@Param("name") name: string, @Req() req: Request) {
    return this.domains.exportZone(name, (req.user as { tenantId: string }).tenantId);
  }

  @Get(":name/verification")
  verifyDelegation(@Param("name") name: string, @Req() req: Request) {
    return this.domains.verifyDelegation(name, (req.user as { tenantId: string }).tenantId);
  }

  @Get(":name")
  findOne(@Param("name") name: string, @Req() req: Request) {
    return this.domains.findOne(name, (req.user as { tenantId: string }).tenantId);
  }

  // Accepts a user JWT or a programmatic API key; key usage is location-checked.
  @Post()
  create(@Body() dto: CreateDomainDto, @Req() req: Request) {
    const tenantId = (req.user as { tenantId?: string })?.tenantId ?? "ephemeral-tenant";
    return this.domains.create(dto, tenantId);
  }
}
