import { Injectable, Logger } from "@nestjs/common";

type Attempt = {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number | null;
};

/**
 * Story 5: brute-force protection for SMTP AUTH.
 *
 * The relay is on the public internet with a predictable port and a username
 * format that is easy to guess (`postmaster@<their domain>`). Without a limit,
 * an attacker gets unlimited password attempts at whatever rate their
 * connection allows.
 *
 * Two independent counters, because they catch different attacks:
 *
 *   - Per IP: one host trying many usernames (credential stuffing).
 *   - Per username: many hosts trying one account (distributed guessing), which
 *     an IP-only limit misses entirely.
 *
 * Held in memory rather than Redis deliberately: this must keep working when
 * Redis is down, and a relay restart clearing the counters is an acceptable
 * trade for a lockout window measured in minutes. If you later run several relay
 * instances behind a load balancer, move it to Redis — an attacker could
 * otherwise get N times the attempts by spreading them across instances.
 */
@Injectable()
export class SmtpThrottleService {
  private readonly logger = new Logger(SmtpThrottleService.name);
  private readonly byIp = new Map<string, Attempt>();
  private readonly byUsername = new Map<string, Attempt>();

  private get maxFailures(): number {
    return Number(process.env.SMTP_AUTH_MAX_FAILURES ?? 10);
  }

  private get windowMs(): number {
    return Number(process.env.SMTP_AUTH_WINDOW_MS ?? 900_000); // 15 minutes
  }

  private get lockoutMs(): number {
    return Number(process.env.SMTP_AUTH_LOCKOUT_MS ?? 900_000);
  }

  /** True when this source should be refused before the password is even checked. */
  isLocked(ip: string, username: string): boolean {
    return this.locked(this.byIp, ip) || this.locked(this.byUsername, username.toLowerCase());
  }

  recordFailure(ip: string, username: string): void {
    const lockedIp = this.bump(this.byIp, ip);
    const lockedUser = this.bump(this.byUsername, username.toLowerCase());

    if (lockedIp) this.logger.warn(`Locked out ${ip} after repeated SMTP auth failures`);
    if (lockedUser) this.logger.warn(`Locked out username ${username} after repeated SMTP auth failures`);
  }

  /**
   * Clear both counters on success. Without this, a user who mistypes a password
   * a few times and then gets it right stays one slip away from a lockout for
   * the rest of the window.
   */
  recordSuccess(ip: string, username: string): void {
    this.byIp.delete(ip);
    this.byUsername.delete(username.toLowerCase());
  }

  /** Housekeeping so the maps cannot grow without bound under a sustained attack. */
  prune(): void {
    const now = Date.now();
    for (const map of [this.byIp, this.byUsername]) {
      for (const [key, attempt] of map) {
        const expired = now - attempt.firstFailureAt > this.windowMs;
        const unlocked = !attempt.lockedUntil || attempt.lockedUntil < now;
        if (expired && unlocked) map.delete(key);
      }
    }
  }

  private locked(map: Map<string, Attempt>, key: string): boolean {
    const attempt = map.get(key);
    if (!attempt?.lockedUntil) return false;
    if (attempt.lockedUntil > Date.now()) return true;
    map.delete(key); // lockout expired
    return false;
  }

  private bump(map: Map<string, Attempt>, key: string): boolean {
    const now = Date.now();
    const existing = map.get(key);

    // Start a fresh window rather than accumulating failures forever — three
    // typos a month apart should never add up to a lockout.
    if (!existing || now - existing.firstFailureAt > this.windowMs) {
      map.set(key, { failures: 1, firstFailureAt: now, lockedUntil: null });
      return false;
    }

    existing.failures += 1;
    if (existing.failures >= this.maxFailures) {
      existing.lockedUntil = now + this.lockoutMs;
      return true;
    }
    return false;
  }
}
