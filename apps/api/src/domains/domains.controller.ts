import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { DomainsService } from "./domains.service";
import { CreateDomainDto } from "./dto/create-domain.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtOrApiKeyGuard } from "../api-keys/jwt-or-api-key.guard";

@ApiTags("domains")
@Controller("domains")
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  findAll() {
    return this.domains.findAll();
  }

  @Get(":name/export")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  exportZone(@Param("name") name: string) {
    return this.domains.exportZone(name);
  }

  @Get(":name/verification")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  verifyDelegation(@Param("name") name: string) {
    return this.domains.verifyDelegation(name);
  }

  @Get(":name")
  findOne(@Param("name") name: string) {
    return this.domains.findOne(name);
  }

  // Accepts a user JWT or a programmatic API key; key usage is location-checked.
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  create(@Body() dto: CreateDomainDto, @Req() req: Request) {
    const tenantId = (req.user as { tenantId?: string })?.tenantId ?? "ephemeral-tenant";
    return this.domains.create(dto, tenantId);
  }
}
