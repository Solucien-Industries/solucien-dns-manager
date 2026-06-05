import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Wraps the generated Prisma client as an injectable Nest provider.
 * Connection failures are logged but non-fatal so the API can still boot and
 * serve seed/fallback data when Postgres isn't available yet (e.g. no Docker).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this._connected = true;
      this.logger.log("Connected to PostgreSQL");
    } catch (err) {
      this._connected = false;
      this.logger.warn(
        `Could not connect to PostgreSQL — serving fallback data. (${(err as Error).message})`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
