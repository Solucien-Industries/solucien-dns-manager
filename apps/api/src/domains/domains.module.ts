import { Module } from "@nestjs/common";
import { RecordsModule } from "../records/records.module";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { DomainsController } from "./domains.controller";
import { DomainsService } from "./domains.service";

@Module({
  imports: [RecordsModule, ApiKeysModule],
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}
