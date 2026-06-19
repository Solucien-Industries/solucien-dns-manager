import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UpdateSmtpSenderDto } from "./dto/update-smtp-sender.dto";
import { UpdateSmtpServerDto } from "./dto/update-smtp-server.dto";
import { SmtpService } from "./smtp.service";

@ApiTags("smtp")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("smtp")
export class SmtpController {
  constructor(private readonly smtp: SmtpService) {}

  /** Platform-provided SMTP relay connection details (Resend-style). */
  @Get()
  get(@Req() req: Request) {
    const user = req.user as { tenantId?: string };
    const tenantId = user.tenantId ?? "ephemeral-tenant";

    return {
      relay: this.smtp.getRelayConfig(),
      credential: this.smtp.getCredentialView(tenantId),
      sender: this.smtp.getSender(tenantId),
      description: "Send emails using SMTP instead of the REST API.",
    };
  }

  /** Generate a new SMTP password for this workspace (shown once). */
  @Post("credentials")
  generateCredentials(@Req() req: Request) {
    const user = req.user as { userId?: string; tenantId?: string };
    return this.smtp.generatePassword(user.tenantId ?? "ephemeral-tenant", user.userId ?? "ephemeral");
  }

  @Delete("credentials")
  revokeCredentials(@Req() req: Request) {
    const user = req.user as { tenantId?: string };
    this.smtp.revokePassword(user.tenantId ?? "ephemeral-tenant");
    return { revoked: true };
  }

  @Patch("sender")
  updateSender(@Body() dto: UpdateSmtpSenderDto, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.smtp.updateSender(user.tenantId ?? "ephemeral-tenant", {
      fromEmail: dto.fromEmail ?? "",
      fromName: dto.fromName ?? "Nani DNS",
    });
  }

  @Get("servers")
  listServers(@Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.smtp.getServers(user.tenantId ?? "ephemeral-tenant");
  }

  @Patch("servers/:id")
  updateServer(@Param("id") id: string, @Body() dto: UpdateSmtpServerDto, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.smtp.updateServer(user.tenantId ?? "ephemeral-tenant", id, dto);
  }
}
