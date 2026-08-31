import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OnboardDomainDto } from "./dto/onboard-domain.dto";
import { SendEmailDto } from "./dto/send-email.dto";
import { UpdateSmtpSenderDto } from "./dto/update-smtp-sender.dto";
import { UpdateSmtpServerDto } from "./dto/update-smtp-server.dto";
import { MailService } from "./mail.service";
import { SesAdminService } from "./ses-admin.service";
import { SmtpService } from "./smtp.service";
import { MessagesService } from "../messages/messages.service";
import { SendingDomainService } from "./sending-domain.service";
import { SmtpCredentialsService } from "./smtp-credentials.service";

@ApiTags("smtp")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("smtp")
export class SmtpController {
  constructor(
    private readonly smtp: SmtpService,
    private readonly mail: MailService,
    private readonly ses: SesAdminService,
    private readonly messages: MessagesService,
    private readonly sendingDomains: SendingDomainService,
    private readonly credentials: SmtpCredentialsService,
  ) {}

  @Get()
  async get(@Req() req: Request) {
    const user = req.user as { tenantId?: string };
    const tenantId = user.tenantId ?? "ephemeral-tenant";
    return {
      relay: this.smtp.getRelayConfig(),
      credential: await this.smtp.getCredentialView(tenantId),
      sender: this.smtp.getSender(tenantId),
      sendingConfigured: this.mail.isConfigured(),
      onboardingConfigured: this.ses.isConfigured(),
      description: "Send emails using SMTP instead of the REST API.",
    };
  }


  @Get("sending-domains")
  listSendingDomains(@Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.sendingDomains.list(user.tenantId ?? "ephemeral-tenant");
  }

  @Post("sending-domains/:domain/enable")
  enableSending(@Param("domain") domain: string, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.sendingDomains.enableSending(domain, user.tenantId ?? "ephemeral-tenant");
  }

  @Get("sending-domains/:domain")
  sendingDomainStatus(@Param("domain") domain: string, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.sendingDomains.refreshVerification(domain, user.tenantId ?? "ephemeral-tenant");
  }


  @Get("credentials")
  listCredentials(@Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.credentials.list(user.tenantId ?? "ephemeral-tenant");
  }

  @Post("credentials")
  createCredential(@Req() req: Request, @Body() body: { name?: string; domainId?: string } = {}) {
    const user = req.user as { userId?: string; tenantId?: string };
    return this.credentials.create(user.tenantId ?? "ephemeral-tenant", user.userId ?? "ephemeral", body);
  }

  @Post("credentials/:id/rotate")
  rotateCredential(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as { userId?: string; tenantId?: string };
    return this.credentials.rotate(id, user.tenantId ?? "ephemeral-tenant", user.userId ?? "ephemeral");
  }

  @Delete("credentials/:id")
  revokeCredential(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.credentials.revoke(id, user.tenantId ?? "ephemeral-tenant");
  }


  @Patch("sender")
  updateSender(@Body() dto: UpdateSmtpSenderDto, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.smtp.updateSender(user.tenantId ?? "ephemeral-tenant", {
      fromEmail: dto.fromEmail ?? "",
      fromName: dto.fromName ?? "Nani DNS",
    });
  }

  @Post("send")
  async send(@Body() dto: SendEmailDto, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    const tenantId = user.tenantId ?? "ephemeral-tenant";
    if (!dto.text && !dto.html) {
      throw new BadRequestException("Provide a text body, an html body, or both.");
    }
    const sender = this.smtp.getSender(tenantId);
    const fromEmail = (dto.fromEmail ?? sender.fromEmail).trim();
    if (!fromEmail) {
      throw new BadRequestException("No sender identity set. Save a From email under SMTP settings, or pass fromEmail.");
    }
    return this.messages.submit(tenantId, dto, fromEmail, sender.fromName);
  }


  
  @Post("domains")
  onboardDomain(@Body() dto: OnboardDomainDto, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.ses.onboardDomain(dto.domain, user.tenantId ?? "ephemeral-tenant");
  }

  /** Verification + DKIM status for a customer sending domain. */
  @Get("domains/:domain")
  domainStatus(@Param("domain") domain: string, @Req() req: Request) {
    return this.ses.verifyOwnedDomain(domain, (req.user as { tenantId: string }).tenantId);
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