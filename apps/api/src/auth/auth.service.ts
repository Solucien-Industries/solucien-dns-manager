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

  /** Find-or-create the user (and a default tenant) when the DB is available. */
  private async provisionUser(dto: LoginDto) {
    if (!this.prisma.connected) {
      // No database yet — issue a token against an ephemeral identity so the
      // auth flow remains testable in local/preview environments.
      return {
        id: "ephemeral",
        email: dto.email,
        name: dto.name ?? null,
        role: dto.email === "preview@solucien.local" ? "OWNER" : "MEMBER",
        tenantId: "ephemeral-tenant",
      };
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
