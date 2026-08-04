import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

export type SendMailInput = {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

export type SendMailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
};

/**
 * Sends real email through AWS SES over SMTP (shared platform account).
 *
 * Configured entirely from environment variables so no AWS-specific SDK is
 * needed — SES exposes a standard SMTP endpoint:
 *   SES_SMTP_HOST      e.g. email-smtp.eu-west-1.amazonaws.com  (region-specific)
 *   SES_SMTP_PORT      587 (STARTTLS) by default
 *   SES_SMTP_USERNAME  SES *SMTP* credential username (NOT an AWS access key)
 *   SES_SMTP_PASSWORD  SES *SMTP* credential password
 *
 * If these are not set, sending fails loudly with a 503 rather than pretending
 * to succeed. The transport is created lazily and reused.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = process.env.SES_SMTP_HOST;
    const username = process.env.SES_SMTP_USERNAME;
    const password = process.env.SES_SMTP_PASSWORD;
    const port = Number(process.env.SES_SMTP_PORT ?? 587);

    if (!host || !username || !password) {
      throw new ServiceUnavailableException(
        "Email sending is not configured. Set SES_SMTP_HOST, SES_SMTP_USERNAME and SES_SMTP_PASSWORD.",
      );
    }

    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: username, pass: password },
      tls: {
        rejectUnauthorized: false,   // dev-only: tolerate local TLS interception
      },
    });

    this.logger.log(`SES SMTP transport ready (${host}:${port})`);
    return this.transporter;
  }

  /** True when the SES SMTP env vars are present. Useful for health checks. */
  isConfigured(): boolean {
    return Boolean(
      process.env.SES_SMTP_HOST &&
        process.env.SES_SMTP_USERNAME &&
        process.env.SES_SMTP_PASSWORD,
    );
  }

  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    if (!input.text && !input.html) {
      // Guard here too, in case a caller bypasses the DTO.
      throw new ServiceUnavailableException("Email must include a text or html body.");
    }

    const transporter = this.getTransporter();
    const from = input.fromName ? `"${input.fromName}" <${input.from}>` : input.from;

    try {
      const info = await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        replyTo: input.replyTo,
      });

      this.logger.log(`Sent email to ${input.to} (messageId ${info.messageId})`);
      return {
        messageId: info.messageId,
        accepted: (info.accepted ?? []).map(String),
        rejected: (info.rejected ?? []).map(String),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown send failure";
      this.logger.error(`Failed to send email to ${input.to}: ${message}`);
      throw new ServiceUnavailableException(`Email delivery failed: ${message}`);
    }
  }
}
