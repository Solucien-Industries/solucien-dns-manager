import { Module } from "@nestjs/common";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { SmsController } from "./sms.controller";
import { SmsService } from "./sms.service";

@Module({
  imports: [ApiKeysModule],
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
