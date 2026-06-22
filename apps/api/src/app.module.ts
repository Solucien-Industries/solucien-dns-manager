import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { PowerDnsModule } from "./powerdns/powerdns.module";
import { AuthModule } from "./auth/auth.module";
import { DomainsModule } from "./domains/domains.module";
import { RecordsModule } from "./records/records.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { SmtpModule } from "./smtp/smtp.module";
import { MonitoringModule } from "./monitoring/monitoring.module";
import { MetricsModule } from "./metrics/metrics.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    PowerDnsModule,
    AuthModule,
    DomainsModule,
    RecordsModule,
    DashboardModule,
    ApiKeysModule,
    SmtpModule,
    MonitoringModule,
    MetricsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
