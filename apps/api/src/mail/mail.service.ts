import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

export type SendMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

/**
 * Transactional email sender (moderation notices, API-key location alerts).
 *
 * Uses a single SMTP transport built from MAIL_* env vars (SES SMTP is a fine
 * backend). When mail isn't configured it logs-and-noops instead of throwing,
 * mirroring the app's DB-less fallback so local/preview mode still works. All
 * sends are best-effort: a mail failure must never fail the triggering action.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.MAIL_HOST;
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS;
    this.from = process.env.MAIL_FROM ?? "Nani DNS <no-reply@nani.dns>";

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.MAIL_PORT ?? 587),
        secure: process.env.MAIL_SECURE === "true",
        auth: user && pass ? { user, pass } : undefined,
      });
      this.logger.log(`Mail transport configured (${host})`);
    } else {
      this.transporter = null;
      this.logger.warn("MAIL_HOST not set — emails will be logged, not sent.");
    }
  }

  /** Fire-and-forget send. Resolves even on failure (logged), never rejects. */
  async send(input: SendMailInput): Promise<void> {
    const recipients = Array.isArray(input.to) ? input.to.join(", ") : input.to;
    if (!recipients) return;

    if (!this.transporter) {
      this.logger.log(`[mail:noop] to=${recipients} subject="${input.subject}"`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        text: input.text ?? stripHtml(input.html),
        html: input.html,
      });
    } catch (err) {
      this.logger.error(`Failed to send "${input.subject}" to ${recipients}: ${(err as Error).message}`);
    }
  }

  sendWarning(to: string | string[], reason: string): Promise<void> {
    return this.send({
      to,
      subject: "A warning has been issued on your Nani DNS account",
      html: notice(
        "Account warning",
        `A platform administrator has issued a warning on your account.`,
        reason,
      ),
    });
  }

  sendSuspension(to: string | string[], reason: string, until: Date | null): Promise<void> {
    const window = until ? `until ${until.toUTCString()}` : "indefinitely";
    return this.send({
      to,
      subject: "Your Nani DNS account has been suspended",
      html: notice(
        "Account suspended",
        `Your account has been suspended ${window} and you will not be able to sign in during this period.`,
        reason,
      ),
    });
  }

  sendBan(to: string | string[], reason: string): Promise<void> {
    return this.send({
      to,
      subject: "Your Nani DNS account has been banned",
      html: notice(
        "Account banned",
        `Your account has been banned and access has been revoked.`,
        reason,
      ),
    });
  }

  sendApiKeyLocationAlert(
    to: string | string[],
    details: { keyPrefix: string; ip: string; country: string | null },
  ): Promise<void> {
    const where = details.country ? `${details.country} (${details.ip})` : details.ip;
    return this.send({
      to,
      subject: "Security alert: API key used from an unapproved location",
      html: notice(
        "Unapproved API key usage",
        `An API key (<code>${details.keyPrefix}…</code>) was used from <strong>${where}</strong>, which is outside your approved locations. If this wasn't expected, revoke the key immediately.`,
      ),
    });
  }

  sendNewLoginLocationAlert(
    to: string | string[],
    details: { ip: string; country: string | null },
  ): Promise<void> {
    const where = details.country ? `${details.country} (${details.ip})` : details.ip;
    return this.send({
      to,
      subject: "Security alert: New login location detected",
      html: notice(
        "New login location",
        `A login was detected from <strong>${where}</strong>, which is outside your approved locations. If this was you, add the location to your approved list. If not, secure the account and rotate passwords.`,
      ),
    });
  }
}

function notice(heading: string, message: string, reason?: string): string {
  const reasonBlock = reason
    ? `<p style="margin:16px 0;padding:12px 16px;background:#f4f4f5;border-left:3px solid #6366f1;border-radius:4px;"><strong>Reason:</strong> ${reason}</p>`
    : "";
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#18181b;">
      <h2 style="margin:0 0 12px;">${heading}</h2>
      <p style="margin:0 0 8px;line-height:1.5;">${message}</p>
      ${reasonBlock}
      <p style="margin:24px 0 0;font-size:12px;color:#71717a;">Nani DNS — Solucien Industries</p>
    </div>`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
