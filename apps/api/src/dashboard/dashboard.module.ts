import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { DomainsModule } from "../domains/domains.module";
import { RecordsModule } from "../records/records.module";

@Module({
  imports: [DomainsModule, RecordsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
