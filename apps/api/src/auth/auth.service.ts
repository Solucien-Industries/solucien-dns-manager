import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { GeoIpService } from "../common/geoip.service";
import { LoginDto } from "./dto/login.dto";

export type LoginContext = {
  ip: string | null;
  userAgent: string | null;
};

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
  ) {}

  async login(dto: LoginDto, ctx: LoginContext = { ip: null, userAgent: null }) {
    const user = await this.provisionUser(dto);
    const ip = dto.clientIp ?? ctx.ip;

    // Moderation gate: block suspended (still within window) and banned accounts.
    const gate = this.evaluateStatus(user);
    if (gate.blocked) {
      await this.recordLogin(user, ip, ctx.userAgent, gate.outcome);
      throw new ForbiddenException(gate.message);
    }
    if (gate.autoCleared) {
      // Suspension window elapsed — lazily restore the account.
      await this.clearExpiredSuspension(user.id);
    }

    await this.recordLogin(user, ip, ctx.userAgent, "SUCCESS");

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
  ): Promise<void> {
    if (!this.prisma.connected || user.id === "ephemeral") return;
    const geo = this.geoip.lookup(ip);
    try {
      await this.prisma.loginEvent.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          ip: ip ?? "unknown",
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

  /** Find-or-create the user (and a default tenant) when the DB is available. */
  private async provisionUser(dto: LoginDto) {
    const presetRole = this.presetRole(dto.email);

    if (!this.prisma.connected) {
      // No database yet — issue a token against an ephemeral identity so the
      // auth flow remains testable in local/preview environments.
      return {
        id: "ephemeral",
        email: dto.email,
        name: dto.name ?? null,
        role: presetRole ?? "MEMBER",
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
    if (existing) return existing;

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
        role: "OWNER",
        tenantId: tenant.id,
      },
    });
  }
}
