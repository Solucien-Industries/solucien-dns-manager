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

@ApiTags("smtp")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("smtp")
export class SmtpController {
  constructor(
    private readonly smtp: SmtpService,
    private readonly mail: MailService,
    private readonly ses: SesAdminService,
  ) {}

  @Get()
  get(@Req() req: Request) {
    const user = req.user as { tenantId?: string };
    const tenantId = user.tenantId ?? "ephemeral-tenant";
    return {
      relay: this.smtp.getRelayConfig(),
      credential: this.smtp.getCredentialView(tenantId),
      sender: this.smtp.getSender(tenantId),
      sendingConfigured: this.mail.isConfigured(),
      onboardingConfigured: this.ses.isConfigured(),
      description: "Send emails using SMTP instead of the REST API.",
    };
  }

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

  /** Send a real email through the platform SES relay. */
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

    // Story #6: only allow sending from a verified/authorised domain.
    await this.ses.assertSenderDomainAllowed(fromEmail, tenantId);

    return this.mail.sendMail({
      from: fromEmail,
      fromName: sender.fromName,
      to: dto.to,
      subject: dto.subject,
      text: dto.text,
      html: dto.html,
      replyTo: dto.replyTo,
    });
  }

  /**
   * Onboard a customer domain for sending: registers it in SES, links it to
   * this tenant's configuration set (per-tenant reputation), and returns the
   * DKIM records the customer must add to their DNS.
   */
  @Post("domains")
  onboardDomain(@Body() dto: OnboardDomainDto, @Req() req: Request) {
    const user = req.user as { tenantId?: string };
    return this.ses.onboardDomain(dto.domain, user.tenantId ?? "ephemeral-tenant");
  }

  /** Verification + DKIM status for a customer sending domain. */
  @Get("domains/:domain")
  domainStatus(@Param("domain") domain: string) {
    return this.ses.getDomainStatus(domain);
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
