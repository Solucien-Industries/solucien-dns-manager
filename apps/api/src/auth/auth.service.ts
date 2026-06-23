import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

/**
 * Exchanges a verified identity (from Auth.js OAuth on the web) for an API JWT.
 * Users are provisioned just-in-time into a default tenant on first login.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.provisionUser(dto);
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
