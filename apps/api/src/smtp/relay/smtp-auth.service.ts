import { createHash, timingSafeEqual } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SmtpThrottleService } from "./smtp-throttle.service";

export type SmtpSessionContext = {
  credentialId: string;
  tenantId: string;
  /** null when the credential is workspace-scoped rather than domain-scoped. */
  domainId: string | null;
  username: string;
};

/**
 * Verifies SMTP AUTH credentials and builds the session context that every later
 * stage (MAIL FROM, RCPT TO, DATA) authorises against.
 *
 * Story 5's brute-force protection lives here rather than in the relay, so the
 * lockout applies before any password comparison happens — an attacker should
 * not be able to use response timing to tell a locked account from a wrong
 * password.
 */
@Injectable()
export class SmtpAuthService {
  private readonly logger = new Logger(SmtpAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: SmtpThrottleService,
  ) {}

  static hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  /**
   * Returns a session context on success, null on failure. Never distinguishes
   * "no such user" from "wrong password" from "locked out" to the caller — the
   * relay returns one 535 for all of them, so an attacker cannot enumerate
   * valid usernames or discover that they have tripped a limit.
   */
  async authenticate(username: string, secret: string, remoteIp: string): Promise<SmtpSessionContext | null> {
    if (!username || !secret) return null;

    const normalizedUsername = username.trim().toLowerCase();

    if (this.throttle.isLocked(remoteIp, normalizedUsername)) {
      this.logger.warn(`Rejected locked-out SMTP auth for ${normalizedUsername} from ${remoteIp}`);
      return null;
    }

    const credential = await this.prisma.smtpCredential.findUnique({
      where: { username: normalizedUsername },
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
      this.throttle.recordFailure(remoteIp, normalizedUsername);
      return null;
    }

    if (!timingSafeEqualHex(presented, credential.secretHash)) {
      this.logger.warn(`SMTP auth failed for ${normalizedUsername} from ${remoteIp}`);
      this.throttle.recordFailure(remoteIp, normalizedUsername);
      return null;
    }

    // ACTIVE only: DISABLED and REVOKED both stop working immediately, which is
    // what story 11 means by "revocation is immediate".
    if (credential.status !== "ACTIVE") {
      this.logger.warn(`SMTP auth rejected for ${normalizedUsername}: credential is ${credential.status}`);
      // Not a brute-force signal — the password was right, the credential is
      // simply switched off. Counting it would lock out a legitimate user who
      // has not noticed their credential was disabled.
      return null;
    }

    this.throttle.recordSuccess(remoteIp, normalizedUsername);

    // Audit trail (story 4: "record last-used timestamp and source IP").
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
