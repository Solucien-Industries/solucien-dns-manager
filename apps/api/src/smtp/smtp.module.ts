import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { SmtpController } from "./smtp.controller";
import { SmtpService } from "./smtp.service";

@Module({
  controllers: [SmtpController],
  providers: [SmtpService, MailService],
  exports: [SmtpService, MailService],
})
export class SmtpModule {}
