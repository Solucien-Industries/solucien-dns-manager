import { createHash, randomBytes } from "crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type SmtpPortOption = {
  port: number;
  encryption: "STARTTLS" | "SSL/TLS";
  label: string;
  recommended?: boolean;
};

export type SmtpRelayConfig = {
  host: string;
  username: string;
  ports: {
    submission: SmtpPortOption;
    implicitTls: SmtpPortOption;
  };
};

export type SmtpCredentialView = {
  configured: boolean;
  prefix: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
};

export type SmtpSenderSettings = {
  fromEmail: string;
  fromName: string;
};

export type SmtpServer = {
  id: string;
  label: string;
  host: string;
  port: number;
  encryption: "STARTTLS" | "SSL/TLS";
  region: string;
  status: "active" | "maintenance";
  primary: boolean;
};

const PASSWORD_PREFIX = "nani_smtp_";

@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);
  private readonly senders = new Map<string, SmtpSenderSettings>();
  private readonly servers = new Map<string, Map<string, SmtpServer>>();

  constructor(private readonly prisma: PrismaService) {}

  private defaultServers(): SmtpServer[] {
    const relay = this.getRelayConfig();
    return [
      {
        id: "srv_submission",
        label: "Primary submission",
        host: relay.host,
        port: relay.ports.submission.port,
        encryption: "STARTTLS",
        region: "Europe",
        status: "active",
        primary: true,
      },
      {
        id: "srv_implicit_tls",
        label: "Implicit TLS",
        host: relay.host,
        port: relay.ports.implicitTls.port,
        encryption: "SSL/TLS",
        region: "Europe",
        status: "active",
        primary: false,
      },
      {
        id: "srv_africa",
        label: "Africa edge relay",
        host: relay.host,
        port: relay.ports.submission.port,
        encryption: "STARTTLS",
        region: "Africa",
        status: "active",
        primary: false,
      },
    ];
  }

  getServers(tenantId: string): SmtpServer[] {
    if (!this.servers.has(tenantId)) {
      this.servers.set(tenantId, new Map(this.defaultServers().map((server) => [server.id, server])));
    }
    return [...this.servers.get(tenantId)!.values()];
  }

  updateServer(tenantId: string, id: string, patch: Partial<SmtpServer>): SmtpServer {
    const tenantServers = this.servers.get(tenantId) ?? new Map(this.defaultServers().map((server) => [server.id, server]));
    const current = tenantServers.get(id);
    if (!current) throw new NotFoundException(`SMTP server ${id} not found`);

    const next: SmtpServer = {
      ...current,
      ...patch,
      id: current.id,
      primary: current.primary,
    };
    tenantServers.set(id, next);
    this.servers.set(tenantId, tenantServers);
    return next;
  }

  getRelayConfig(): SmtpRelayConfig {
    const submissionPort = Number(process.env.SMTP_RELAY_PORT?.trim() || 587);
    const implicitTlsPort = Number(process.env.SMTP_RELAY_TLS_PORT?.trim() || 465);

    return {
      host: process.env.SMTP_RELAY_HOST?.trim() || "smtp.nani.dns",
      username: process.env.SMTP_RELAY_USERNAME?.trim() || "nani",
      ports: {
        submission: {
          port: submissionPort,
          encryption: "STARTTLS",
          label: "Submission (STARTTLS)",
          recommended: true,
        },
        implicitTls: {
          port: implicitTlsPort,
          encryption: "SSL/TLS",
          label: "Implicit TLS",
        },
      },
    };
  }

  async getCredentialView(tenantId: string): Promise<SmtpCredentialView> {
    if (!this.prisma.connected) return { configured: false, prefix: null, createdAt: null, lastUsedAt: null };
    const match = await this.prisma.smtpCredential.findFirst({ where: { tenantId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    if (!match) {
      return { configured: false, prefix: null, createdAt: null, lastUsedAt: null };
    }

    return {
      configured: true,
      prefix: match.prefix,
      createdAt: match.createdAt.toISOString(),
      lastUsedAt: match.lastUsedAt?.toISOString() ?? null,
    };
  }

  async generatePassword(tenantId: string, userId: string, domainId?: string): Promise<{ password: string; credential: SmtpCredentialView; id: string; username: string }> {
    const secret = `${PASSWORD_PREFIX}${randomBytes(24).toString("base64url")}`;
    const secretHash = this.hashSecret(secret);
    const prefix = secret.slice(0, 16);

    if (!this.prisma.connected) throw new NotFoundException("SMTP credentials require PostgreSQL.");
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
    if (!user) throw new NotFoundException("Credential owner not found in this workspace.");
    if (domainId) {
      const domain = await this.prisma.domain.findFirst({ where: { id: domainId, tenantId }, select: { id: true } });
      if (!domain) throw new NotFoundException("Domain not found in this workspace.");
    }
    const username = `smtp_${randomBytes(12).toString("hex")}`;
    const record = await this.prisma.smtpCredential.create({ data: { name: "SMTP credential", username, prefix, secretHash, tenantId, domainId, createdById: user.id } });
    this.logger.log(`Generated SMTP password for tenant ${tenantId}`);

    return {
      password: secret,
      credential: {
        configured: true,
        prefix: record.prefix,
        createdAt: record.createdAt.toISOString(),
        lastUsedAt: null,
      },
      id: record.id,
      username: record.username,
    };
  }

  async revokePassword(tenantId: string, id?: string): Promise<void> {
    if (!this.prisma.connected) return;
    const target = id
      ? await this.prisma.smtpCredential.findFirst({ where: { id, tenantId, status: "ACTIVE" }, select: { id: true } })
      : await this.prisma.smtpCredential.findFirst({ where: { tenantId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (!target) throw new NotFoundException("Active SMTP credential not found.");
    await this.prisma.smtpCredential.update({ where: { id: target.id }, data: { status: "REVOKED", revokedAt: new Date() } });
  }

  async rotatePassword(tenantId: string, userId: string, id: string) {
    const current = await this.prisma.smtpCredential.findFirst({ where: { id, tenantId, status: "ACTIVE" } });
    if (!current) throw new NotFoundException("Active SMTP credential not found.");
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
    if (!user) throw new NotFoundException("Credential owner not found in this workspace.");
    const secret = `${PASSWORD_PREFIX}${randomBytes(24).toString("base64url")}`;
    const prefix = secret.slice(0, 16);
    const username = `smtp_${randomBytes(12).toString("hex")}`;
    const now = new Date();
    const [, record] = await this.prisma.$transaction([
      this.prisma.smtpCredential.update({ where: { id }, data: { status: "REVOKED", revokedAt: now, rotatedAt: now } }),
      this.prisma.smtpCredential.create({ data: { name: current.name, username, prefix, secretHash: this.hashSecret(secret), tenantId, domainId: current.domainId, createdById: user.id } }),
    ]);
    return { password: secret, id: record.id, username: record.username, credential: { configured: true, prefix: record.prefix, createdAt: record.createdAt.toISOString(), lastUsedAt: null } };
  }

  getSender(tenantId: string): SmtpSenderSettings {
    return (
      this.senders.get(tenantId) ?? {
        fromEmail: "",
        fromName: "Nani DNS",
      }
    );
  }

  updateSender(tenantId: string, settings: SmtpSenderSettings): SmtpSenderSettings {
    const next = {
      fromEmail: settings.fromEmail.trim(),
      fromName: settings.fromName.trim() || "Nani DNS",
    };
    this.senders.set(tenantId, next);
    return next;
  }

  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }
}
