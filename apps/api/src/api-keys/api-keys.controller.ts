import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiKeysService } from "./api-keys.service";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";

@ApiTags("api-keys")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@Req() req: Request) {
    const user = req.user as { userId?: string; tenantId?: string };
    return this.apiKeys.list(user.tenantId ?? "ephemeral-tenant", user.userId ?? "ephemeral");
  }

  @Post()
  create(@Body() dto: CreateApiKeyDto, @Req() req: Request) {
    const user = req.user as { userId?: string; tenantId?: string };
    return this.apiKeys.create({
      name: dto.name,
      tenantId: user.tenantId ?? "ephemeral-tenant",
      userId: user.userId ?? "ephemeral",
    });
  }

  @Delete(":id")
  revoke(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as { userId?: string; tenantId?: string };
    return this.apiKeys.revoke(id, user.tenantId ?? "ephemeral-tenant", user.userId ?? "ephemeral");
  }
}
