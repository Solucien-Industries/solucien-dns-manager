import { createHash, randomBytes } from "crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type StoredApiKey = ApiKeyRecord & {
  keyHash: string;
  tenantId: string;
  userId: string;
};

const KEY_PREFIX = "sdm_";

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  private readonly memoryStore = new Map<string, StoredApiKey>();

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string): Promise<ApiKeyRecord[]> {
    if (this.prisma.connected) {
      const rows = await this.prisma.apiKey.findMany({
        where: { tenantId, userId, revokedAt: null },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((row) => this.toRecord(row));
    }

    return [...this.memoryStore.values()]
      .filter((key) => key.tenantId === tenantId && key.userId === userId)
      .map(({ keyHash: _keyHash, tenantId: _tenantId, userId: _userId, ...record }) => record);
  }

  async create(input: {
    name: string;
    tenantId: string;
    userId: string;
  }): Promise<{ key: ApiKeyRecord; secret: string }> {
    const secret = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
    const keyHash = this.hashSecret(secret);
    const prefix = secret.slice(0, 12);

    if (this.prisma.connected) {
      const created = await this.prisma.apiKey.create({
        data: {
          name: input.name,
          prefix,
          keyHash,
          tenantId: input.tenantId,
          userId: input.userId,
        },
      });
      return { key: this.toRecord(created), secret };
    }

    const record: StoredApiKey = {
      id: `key_${randomBytes(8).toString("hex")}`,
      name: input.name,
      prefix,
      keyHash,
      tenantId: input.tenantId,
      userId: input.userId,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    this.memoryStore.set(record.id, record);
    this.logger.log(`Created ephemeral API key ${record.id} for tenant ${input.tenantId}`);
    return {
      key: {
        id: record.id,
        name: record.name,
        prefix: record.prefix,
        createdAt: record.createdAt,
        lastUsedAt: null,
      },
      secret,
    };
  }

  async revoke(id: string, tenantId: string, userId: string): Promise<void> {
    if (this.prisma.connected) {
      const existing = await this.prisma.apiKey.findFirst({
        where: { id, tenantId, userId, revokedAt: null },
      });
      if (!existing) throw new NotFoundException("API key not found.");
      await this.prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      return;
    }

    const existing = this.memoryStore.get(id);
    if (!existing || existing.tenantId !== tenantId || existing.userId !== userId) {
      throw new NotFoundException("API key not found.");
    }
    this.memoryStore.delete(id);
  }

  /** Validate a bearer API key and return the owning tenant/user if valid. */
  async validateSecret(secret: string): Promise<{ tenantId: string; userId: string; keyId: string } | null> {
    const keyHash = this.hashSecret(secret);

    if (this.prisma.connected) {
      const row = await this.prisma.apiKey.findFirst({
        where: { keyHash, revokedAt: null },
      });
      if (!row) return null;
      await this.prisma.apiKey.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      });
      return { tenantId: row.tenantId, userId: row.userId, keyId: row.id };
    }

    const match = [...this.memoryStore.values()].find((key) => key.keyHash === keyHash);
    if (!match) return null;
    match.lastUsedAt = new Date().toISOString();
    this.memoryStore.set(match.id, match);
    return { tenantId: match.tenantId, userId: match.userId, keyId: match.id };
  }

  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  private toRecord(row: {
    id: string;
    name: string;
    prefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
  }): ApiKeyRecord {
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    };
  }
}
