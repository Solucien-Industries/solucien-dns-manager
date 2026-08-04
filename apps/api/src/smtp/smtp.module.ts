import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { SesAdminService } from "./ses-admin.service";
import { SmtpController } from "./smtp.controller";
import { SmtpService } from "./smtp.service";

@Module({
  controllers: [SmtpController],
  providers: [SmtpService, MailService, SesAdminService],
  exports: [SmtpService, MailService, SesAdminService],
})
export class SmtpModule {}
