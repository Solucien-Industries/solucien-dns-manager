import { Module } from "@nestjs/common";
import { DomainsModule } from "../domains/domains.module";
import { RecordsModule } from "../records/records.module";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

@Module({
  imports: [DomainsModule, RecordsModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
