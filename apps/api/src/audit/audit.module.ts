import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/**
 * Global so the app-level AuditInterceptor (registered in AppModule) and the
 * admin console can both inject AuditService without re-importing.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
