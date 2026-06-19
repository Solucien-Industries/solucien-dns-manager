import { createHash, randomBytes } from "crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";

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

type StoredSmtpCredential = {
  id: string;
  prefix: string;
  passwordHash: string;
  tenantId: string;
  userId: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const PASSWORD_PREFIX = "nani_smtp_";

@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);
  private readonly credentials = new Map<string, StoredSmtpCredential>();
  private readonly senders = new Map<string, SmtpSenderSettings>();
  private readonly servers = new Map<string, Map<string, SmtpServer>>();

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
    const submissionPort = Number(process.env.SMTP_RELAY_PORT ?? 587);
    const implicitTlsPort = Number(process.env.SMTP_RELAY_TLS_PORT ?? 465);

    return {
      host: process.env.SMTP_RELAY_HOST ?? "smtp.nani.dns",
      username: process.env.SMTP_RELAY_USERNAME ?? "nani",
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

  getCredentialView(tenantId: string): SmtpCredentialView {
    const match = [...this.credentials.values()].find((item) => item.tenantId === tenantId);
    if (!match) {
      return { configured: false, prefix: null, createdAt: null, lastUsedAt: null };
    }

    return {
      configured: true,
      prefix: match.prefix,
      createdAt: match.createdAt,
      lastUsedAt: match.lastUsedAt,
    };
  }

  generatePassword(tenantId: string, userId: string): { password: string; credential: SmtpCredentialView } {
    const secret = `${PASSWORD_PREFIX}${randomBytes(24).toString("base64url")}`;
    const passwordHash = this.hashSecret(secret);
    const prefix = secret.slice(0, 16);

    for (const [id, item] of this.credentials.entries()) {
      if (item.tenantId === tenantId) this.credentials.delete(id);
    }

    const record: StoredSmtpCredential = {
      id: `smtp_${randomBytes(8).toString("hex")}`,
      prefix,
      passwordHash,
      tenantId,
      userId,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    this.credentials.set(record.id, record);
    this.logger.log(`Generated SMTP password for tenant ${tenantId}`);

    return {
      password: secret,
      credential: {
        configured: true,
        prefix: record.prefix,
        createdAt: record.createdAt,
        lastUsedAt: null,
      },
    };
  }

  revokePassword(tenantId: string): void {
    for (const [id, item] of this.credentials.entries()) {
      if (item.tenantId === tenantId) this.credentials.delete(id);
    }
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
