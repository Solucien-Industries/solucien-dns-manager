import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { MailQueueService } from "./mail-queue.service";
import { MessageIntakeService } from "./message-intake.service";
import { SmtpAuthService } from "./smtp-auth.service";
import { SmtpRelayServer } from "./smtp-relay.server";

/**
 * Import this from SmtpModule (or AppModule directly). The relay starts with
 * the Nest lifecycle — there is no separate process to run.
 *
 * If you later want the relay to scale independently of the API, this module is
 * the seam: point a second Nest entrypoint at it alone and drop it from the API
 * process. Nothing here depends on the HTTP server.
 */
@Module({
  imports: [PrismaModule],
  providers: [SmtpAuthService, MessageIntakeService, MailQueueService, SmtpRelayServer],
  exports: [MailQueueService, MessageIntakeService],
})
export class SmtpRelayModule {}
