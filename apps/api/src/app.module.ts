import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { CommonModule } from "./common/common.module";
import { MailModule } from "./mail/mail.module";
import { PowerDnsModule } from "./powerdns/powerdns.module";
import { AuthModule } from "./auth/auth.module";
import { DomainsModule } from "./domains/domains.module";
import { RecordsModule } from "./records/records.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { SmtpModule } from "./smtp/smtp.module";
import { MonitoringModule } from "./monitoring/monitoring.module";
import { MetricsModule } from "./metrics/metrics.module";
import { UsersModule } from "./users/users.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import { AuditInterceptor } from "./audit/audit.interceptor";
import { HealthController } from "./health/health.controller";
import { SmsModule } from "./sms/sms.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CommonModule,
    MailModule,
    PowerDnsModule,
    AuthModule,
    DomainsModule,
    RecordsModule,
    DashboardModule,
    ApiKeysModule,
    SmtpModule,
    MonitoringModule,
    MetricsModule,
    UsersModule,
    NotificationsModule,
    AdminModule,
    AuditModule,
    SmsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AppModule {}
