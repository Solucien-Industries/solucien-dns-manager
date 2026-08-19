import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { SesAdminService } from "./ses-admin.service";
import { SmtpController } from "./smtp.controller";
import { SmtpService } from "./smtp.service";
import { PrismaModule } from "../prisma/prisma.module";
import { MessagesController } from "../messages/messages.controller";
import { MessagesService } from "../messages/messages.service";
import { SmtpRelayModule } from "./relay/smtp-relay.module";

@Module({
  imports: [PrismaModule, SmtpRelayModule],
  controllers: [SmtpController, MessagesController],
  providers: [SmtpService, MailService, SesAdminService, MessagesService],
  exports: [SmtpService, MailService, SesAdminService],
})
export class SmtpModule {}