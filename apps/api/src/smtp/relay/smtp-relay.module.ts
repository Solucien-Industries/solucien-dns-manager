import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { DeliveryWorker } from "./delivery.worker";
import { MailQueueService } from "./mail-queue.service";
import { MessageIntakeService } from "./message-intake.service";
import { SmtpAuthService } from "./smtp-auth.service";
import { SmtpRelayServer } from "./smtp-relay.server";

/**
 * Import this from SmtpModule. Both halves of the pipeline live here: the relay
 * accepts and queues (story 8), the worker delivers (story 9).
 *
 * If you later want to scale delivery independently of intake, this module is
 * the seam — point a second Nest entrypoint at DeliveryWorker alone and set
 * SMTP_RELAY_ENABLED=false there, or vice versa.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    SmtpAuthService,
    MessageIntakeService,
    MailQueueService,
    SmtpRelayServer,
    DeliveryWorker,
  ],
  exports: [MailQueueService, MessageIntakeService],
})
export class SmtpRelayModule {}
