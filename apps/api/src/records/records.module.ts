import { Module } from "@nestjs/common";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";

@Module({
  imports: [ApiKeysModule],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
