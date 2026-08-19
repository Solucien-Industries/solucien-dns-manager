import { createHash, timingSafeEqual } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type SmtpSessionContext = {
  credentialId: string;
  tenantId: string;
  /** null when the credential is workspace-scoped rather than domain-scoped. */
  domainId: string | null;
  username: string;
};

/**
 * Verifies SMTP AUTH credentials and builds the session context that every
 * later stage (MAIL FROM, RCPT TO, DATA) authorises against.
 *
 * Scope of this file vs. the spec: credential *creation*, rotation and
 * revocation are stories 4 and 11 and are not implemented here — this only
 * reads what those stories write. `hashSecret` is kept byte-compatible with the
 * existing SmtpService.hashSecret so credentials issued by either path verify.
 */
@Injectable()
export class SmtpAuthService {
  private readonly logger = new Logger(SmtpAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  static hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  /**
   * Returns a session context on success, null on failure. Never distinguishes
   * "no such user" from "wrong password" to the caller — the relay returns a
   * single 535 for both so an attacker cannot enumerate valid usernames.
   */
  async authenticate(username: string, secret: string, remoteIp: string): Promise<SmtpSessionContext | null> {
    if (!username || !secret) return null;

    const credential = await this.prisma.smtpCredential.findUnique({
      where: { username: username.trim().toLowerCase() },
      select: {
        id: true,
        tenantId: true,
        domainId: true,
        username: true,
        secretHash: true,
        status: true,
      },
    });

    // Hash regardless of whether the credential exists, so a missing username
    // and a wrong password take the same amount of time.
    const presented = SmtpAuthService.hashSecret(secret);
    if (!credential) {
      timingSafeEqualHex(presented, presented);
      return null;
    }

    if (!timingSafeEqualHex(presented, credential.secretHash)) {
      this.logger.warn(`SMTP auth failed for ${username} from ${remoteIp}`);
      return null;
    }

    if (credential.status !== "ACTIVE") {
      this.logger.warn(`SMTP auth rejected for ${username}: credential is ${credential.status}`);
      return null;
    }

    // Audit trail (story 4: "Record last-used timestamp and source IP").
    // Fire-and-forget: a failed audit write must not fail the session.
    this.prisma.smtpCredential
      .update({
        where: { id: credential.id },
        data: { lastUsedAt: new Date(), lastUsedIp: remoteIp },
      })
      .catch((err: Error) => this.logger.warn(`Could not record credential use: ${err.message}`));

    return {
      credentialId: credential.id,
      tenantId: credential.tenantId,
      domainId: credential.domainId,
      username: credential.username,
    };
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
