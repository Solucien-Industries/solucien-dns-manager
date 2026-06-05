import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { DomainsService } from "./domains.service";
import { CreateDomainDto } from "./dto/create-domain.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("domains")
@Controller("domains")
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  findAll() {
    return this.domains.findAll();
  }

  @Get(":name")
  findOne(@Param("name") name: string) {
    return this.domains.findOne(name);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateDomainDto, @Req() req: Request) {
    const tenantId = (req.user as { tenantId?: string })?.tenantId ?? "ephemeral-tenant";
    return this.domains.create(dto, tenantId);
  }
}
