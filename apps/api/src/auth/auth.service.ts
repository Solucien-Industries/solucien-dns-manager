import { ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import ipaddr from "ipaddr.js";
import { PrismaService } from "../prisma/prisma.service";
import { GeoIpService } from "../common/geoip.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MailService } from "../mail/mail.service";
import { LoginDto } from "./dto/login.dto";
import { PasswordLoginDto } from "./dto/password-login.dto";
import { RegisterDto } from "./dto/register.dto";
import { hashPassword, verifyPassword } from "./password.util";

export type LoginContext = {
  ip: string | null;
  userAgent: string | null;
};

/**
 * The permanent platform admin. Configurable via env for other deployments;
 * defaults to the bootstrap address for this workspace. Case-insensitive.
 */
const BOOTSTRAP_ADMIN_EMAIL = (process.env.PLATFORM_ADMIN_EMAIL ?? "becky.malaak@solucien.co.ze").toLowerCase();

/**
 * Exchanges a verified identity (from Auth.js OAuth on the web) for an API JWT.
 * Users are provisioned just-in-time into a default tenant on first login.
 * Also enforces moderation (suspended/banned users are blocked) and records a
 * geolocated LoginEvent for the admin console.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly geoip: GeoIpService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) { }

  async login(dto: LoginDto, ctx: LoginContext = { ip: null, userAgent: null }) {
    const user = await this.provisionUser(dto);
    return this.finishLogin(user, dto.clientIp ?? ctx.ip, ctx.userAgent);
  }

  /** Create a new local (email/password) account and immediately log it in. */
  async register(dto: RegisterDto, ctx: LoginContext = { ip: null, userAgent: null }) {
    if (!this.prisma.connected) {
      throw new ForbiddenException("Account registration is unavailable right now.");
    }

    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Never let registration attach a password to an account it doesn't
      // already own the credentials for (would let anyone hijack an OAuth
      // account just by knowing its email).
      throw new ConflictException("An account with this email already exists.");
    }

    const grantAdmin = await this.resolveAdminGrant(email);
    const passwordHash = await hashPassword(dto.password);

    const slug = email.split("@")[1]?.replace(/[^a-z0-9]/gi, "-").toLowerCase() ?? "tenant";
    const tenant = await this.prisma.tenant.upsert({
      where: { slug },
      update: {},
      create: { name: dto.name ?? email, slug },
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name ?? null,
        provider: "password",
        passwordHash,
        role: grantAdmin ? "ADMIN" : "OWNER",
        tenantId: tenant.id,
      },
    });

    return this.finishLogin(user, dto.clientIp ?? ctx.ip, ctx.userAgent);
  }

  /** Log in with a previously-registered email/password. */
  async loginWithPassword(dto: PasswordLoginDto, ctx: LoginContext = { ip: null, userAgent: null }) {
    if (!this.prisma.connected) {
      throw new ForbiddenException("Password login is unavailable right now.");
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // Same generic message whether the account doesn't exist, has no password
    // set (OAuth-only), or the password is wrong — don't leak which.
    if (!user?.passwordHash || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    return this.finishLogin(user, dto.clientIp ?? ctx.ip, ctx.userAgent);
  }

  /** Shared tail of every login path: moderation gate, audit, JWT issuance. */
  private async finishLogin(
    user: Awaited<ReturnType<AuthService["provisionUser"]>>,
    ip: string | null,
    userAgent: string | null,
  ) {
    // Moderation gate: block suspended (still within window) and banned accounts.
    const gate = this.evaluateStatus(user);
    if (gate.blocked) {
      await this.recordLogin(user, ip, userAgent, gate.outcome);
      throw new ForbiddenException(gate.message);
    }
    if (gate.autoCleared) {
      // Suspension window elapsed — lazily restore the account.
      await this.clearExpiredSuspension(user.id);
    }

    const login = await this.recordLogin(user, ip, userAgent, "SUCCESS");
    await this.reconcileApprovedLoginLocation(user, login.ip, login.country);

    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    });
    return {
      accessToken: token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
    };
  }

  /**
   * Interpret the persisted status. WARNED never blocks. SUSPENDED blocks until
   * `suspendedUntil` (null = indefinite); a past expiry auto-clears to ACTIVE.
   */
  private evaluateStatus(user: {
    status?: string;
    statusReason?: string | null;
    suspendedUntil?: Date | null;
  }): { blocked: boolean; autoCleared: boolean; outcome: string; message: string } {
    const reason = user.statusReason ? ` Reason: ${user.statusReason}` : "";
    if (user.status === "BANNED") {
      return { blocked: true, autoCleared: false, outcome: "BLOCKED_BANNED", message: `Your account has been banned.${reason}` };
    }
    if (user.status === "SUSPENDED") {
      const until = user.suspendedUntil ? new Date(user.suspendedUntil) : null;
      if (until && until.getTime() <= Date.now()) {
        return { blocked: false, autoCleared: true, outcome: "SUCCESS", message: "" };
      }
      const window = until ? ` until ${until.toUTCString()}` : "";
      return {
        blocked: true,
        autoCleared: false,
        outcome: "BLOCKED_SUSPENDED",
        message: `Your account is suspended${window}.${reason}`,
      };
    }
    return { blocked: false, autoCleared: false, outcome: "SUCCESS", message: "" };
  }

  private async clearExpiredSuspension(userId: string): Promise<void> {
    if (!this.prisma.connected) return;
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: "ACTIVE", statusReason: null, suspendedUntil: null, statusUpdatedAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(`Failed to clear expired suspension for ${userId}: ${(err as Error).message}`);
    }
  }

  private async recordLogin(
    user: { id: string; tenantId: string },
    ip: string | null,
    userAgent: string | null,
    outcome: string,
  ): Promise<{ ip: string; country: string | null }> {
    const resolvedIp = ip ?? "unknown";
    const geo = this.geoip.lookup(ip);
    if (!this.prisma.connected || user.id === "ephemeral") {
      return { ip: resolvedIp, country: geo?.country ?? null };
    }
    try {
      await this.prisma.loginEvent.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          ip: resolvedIp,
          country: geo?.country ?? null,
          region: geo?.region ?? null,
          city: geo?.city ?? null,
          userAgent: userAgent?.slice(0, 512) ?? null,
          outcome,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to record login event for ${user.id}: ${(err as Error).message}`);
    }
    return { ip: resolvedIp, country: geo?.country ?? null };
  }

  private async reconcileApprovedLoginLocation(
    user: { id: string; tenantId: string },
    ip: string,
    country: string | null,
  ): Promise<void> {
    if (!this.prisma.connected || user.id === "ephemeral") return;

    try {
      const rules = await this.prisma.approvedLocation.findMany({ where: { tenantId: user.tenantId } });
      if (rules.length === 0) {
        const firstRule = toFirstLocationRule(ip, country);
        if (!firstRule) return;
        await this.prisma.approvedLocation.create({
          data: {
            tenantId: user.tenantId,
            type: firstRule.type,
            value: firstRule.value,
            label: "First successful login location",
          },
        });
        return;
      }

      const isApproved = rules.some((rule) => {
        if (rule.type === "COUNTRY") {
          return country != null && rule.value.toUpperCase() === country.toUpperCase();
        }
        return ip !== "unknown" && cidrMatch(ip, rule.value);
      });
      if (isApproved) return;

      const recipients = await this.prisma.user.findMany({
        where: { tenantId: user.tenantId, role: { in: ["OWNER", "ADMIN"] } },
        select: { id: true, email: true },
      });
      if (recipients.length === 0) return;

      const where = country ? `${country} (${ip})` : ip;
      const body =
        `New login detected from ${where}. Review this sign-in. If trusted, add it to approved locations. ` +
        `If untrusted, remove access and change passwords immediately.`;

      await Promise.all(
        recipients.map((recipient) =>
          this.notifications.create({
            userId: recipient.id,
            tenantId: user.tenantId,
            kind: "LOGIN_LOCATION",
            title: "New login location detected",
            body,
          }),
        ),
      );

      void this.mail.sendNewLoginLocationAlert(
        recipients.map((recipient) => recipient.email),
        { ip, country },
      );
    } catch (err) {
      this.logger.warn(`Failed to reconcile login location for ${user.id}: ${(err as Error).message}`);
    }
  }


  /**
   * Built-in demo/preview identities map to a fixed role so the dashboard can be
   * explored as either a platform admin or a regular member without OAuth.
   */
  private presetRole(email: string): "OWNER" | "ADMIN" | "MEMBER" | null {
    switch (email) {
      case "admin@solucien.local":
        return "ADMIN";
      case "preview@solucien.local":
        return "OWNER";
      case "user@solucien.local":
        return "MEMBER";
      default:
        return null;
    }
  }

  /**
   * True when this email should hold platform ADMIN: the permanent bootstrap
   * admin, or a pending invite from an existing admin. Consumes (deletes) the
   * invite, if any — it's a one-time grant, not a durable allowlist.
   */
  private async resolveAdminGrant(email: string): Promise<boolean> {
    const normalized = email.toLowerCase();
    if (normalized === BOOTSTRAP_ADMIN_EMAIL) return true;
    if (!this.prisma.connected) return false;

    const invite = await this.prisma.adminInvite.findUnique({ where: { email: normalized } });
    if (!invite) return false;

    await this.prisma.adminInvite.delete({ where: { id: invite.id } }).catch(() => undefined);
    return true;
  }

  /** Find-or-create the user (and a default tenant) when the DB is available. */
  private async provisionUser(dto: LoginDto) {
    const presetRole = this.presetRole(dto.email);

    if (!this.prisma.connected) {
      // No database yet — issue a token against an ephemeral identity so the
      // auth flow remains testable in local/preview environments.
      const isBootstrapAdmin = dto.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
      return {
        id: "ephemeral",
        email: dto.email,
        name: dto.name ?? null,
        role: presetRole ?? (isBootstrapAdmin ? "ADMIN" : "MEMBER"),
        tenantId: "ephemeral-tenant",
        status: "ACTIVE" as const,
        statusReason: null,
        suspendedUntil: null,
      };
    }

    // Demo/preview identities are upserted into a shared preview tenant with a
    // deterministic role (re-login always refreshes the role), so "log in as
    // admin" and "log in as user" stay distinct and consistent.
    if (presetRole) {
      const tenant = await this.prisma.tenant.upsert({
        where: { slug: "solucien-preview" },
        update: {},
        create: { name: "Solucien Preview", slug: "solucien-preview" },
      });

      return this.prisma.user.upsert({
        where: { email: dto.email },
        update: { role: presetRole },
        create: {
          email: dto.email,
          name: dto.name ?? null,
          provider: dto.provider ?? "preview",
          role: presetRole,
          tenantId: tenant.id,
        },
      });
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      // Retroactively honor a fresh bootstrap-email change or a just-created
      // invite for an account that already existed.
      if (existing.role !== "ADMIN" && (await this.resolveAdminGrant(dto.email))) {
        return this.prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
      }
      return existing;
    }

    const grantAdmin = await this.resolveAdminGrant(dto.email);

    const slug = dto.email.split("@")[1]?.replace(/[^a-z0-9]/gi, "-").toLowerCase() ?? "tenant";
    const tenant = await this.prisma.tenant.upsert({
      where: { slug },
      update: {},
      create: { name: dto.name ?? dto.email, slug },
    });

    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name ?? null,
        provider: dto.provider ?? null,
        // New real signups only ever get OWNER of their own new tenant — never
        // platform ADMIN — unless they're the bootstrap admin or hold an invite.
        role: grantAdmin ? "ADMIN" : "OWNER",
        tenantId: tenant.id,
      },
    });
  }
}

function toFirstLocationRule(ip: string, country: string | null): { type: "COUNTRY" | "CIDR"; value: string } | null {
  if (country) return { type: "COUNTRY", value: country.toUpperCase() };
  if (ip === "unknown") return null;
  try {
    const parsed = ipaddr.parse(ip);
    return {
      type: "CIDR",
      value: `${ip}/${parsed.kind() === "ipv4" ? "32" : "128"}`,
    };
  } catch {
    return null;
  }
}

function cidrMatch(ip: string, cidr: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    const range = ipaddr.parseCIDR(cidr);
    if (addr.kind() !== range[0].kind()) return false;
    return (addr as ipaddr.IPv4).match(range as [ipaddr.IPv4, number]);
  } catch {
    return false;
  }
}
