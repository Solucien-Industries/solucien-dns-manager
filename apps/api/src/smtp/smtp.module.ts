import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { SesAdminService } from "./ses-admin.service";
import { SmtpController } from "./smtp.controller";
import { SmtpService } from "./smtp.service";
import { PrismaModule } from "../prisma/prisma.module";
import { MessagesController } from "../messages/messages.controller";
import { MessagesService } from "../messages/messages.service";
import { SmtpRelayModule } from "./relay/smtp-relay.module";
import { RecordsModule } from "../records/records.module";
import { SendingDomainService } from "./sending-domain.service";
import { SmtpCredentialsService } from "./smtp-credentials.service";

@Module({
  
  imports: [PrismaModule, SmtpRelayModule, RecordsModule],
  controllers: [SmtpController, MessagesController],
  providers: [
    SmtpService,
    MailService,
    SesAdminService,
    MessagesService,
    SendingDomainService,
    SmtpCredentialsService,
  ],
  exports: [SmtpService, MailService, SesAdminService],
})
export class SmtpModule {}