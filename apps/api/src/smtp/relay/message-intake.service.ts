import { randomBytes } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { simpleParser } from "mailparser";
import { PrismaService } from "../../prisma/prisma.service";
import { parseSenderDomain, senderDomainRejection } from "../sender-authorization";
import { MailQueueService } from "./mail-queue.service";
import type { SmtpSessionContext } from "./smtp-auth.service";
import {
  fromHeaderMismatch,
  malformedSender,
  missingFromHeader,
  queueUnavailable,
  SmtpResponseError,
  unparseableMime,
} from "./smtp-errors";

export type IntakeInput = {
  session: SmtpSessionContext;
  /** What the client sent in MAIL FROM, before rewriting. */
  submittedMailFrom: string;
  recipients: string[];
  raw: Buffer;
  remoteIp: string;
  smtpSessionId: string;
};

export type IntakeResult = {
  messageId: string;
  queued: boolean;
};


@Injectable()
export class MessageIntakeService {
  private readonly logger = new Logger(MessageIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: MailQueueService,
  ) {}

  async accept(input: IntakeInput): Promise<IntakeResult> {
    // --- 1. Parse headers only -------------------------------------------
    // Full-body parsing would pull every attachment of a 25 MB message into
    // memory on every submission. Only headers are needed to authorise and log;
    // the body travels untouched to the delivery worker.
    const headers = await this.parseHeaders(input.raw);

    const headerFromAddress = headers.fromAddress;
    if (!headerFromAddress) throw missingFromHeader();

    const headerFromDomain = parseSenderDomain(headerFromAddress);
    if (!headerFromDomain) throw malformedSender();

    // --- 2. Authorise the sending domain ---------------------------------
    // Story 6: header From and envelope MAIL FROM are validated separately. The
    // header is what recipients see, so it is the one that must belong here.
    const domain = await this.prisma.domain.findUnique({
      where: { name: headerFromDomain },
      select: {
        id: true,
        name: true,
        tenantId: true,
        sendingVerification: true,
        operationalStatus: true,
        returnPathHost: true,
      },
    });

    const rejection = senderDomainRejection(domain, input.session.tenantId);
    if (rejection || !domain) throw new SmtpResponseError(550, `5.7.1 ${rejection ?? "Sender domain is not authorised."}`);

    // A domain-scoped credential may only send for its own domain.
    if (input.session.domainId && input.session.domainId !== domain.id) {
      throw fromHeaderMismatch();
    }

    // --- 3. Rewrite the envelope sender ----------------------------------
    // Bounces must return to us, not to the customer's mailbox, so the
    // return-path is platform-controlled and per-message. The header From is
    // left exactly as the customer set it.
    const messageId = `msg_${randomBytes(12).toString("base64url")}`;
    const returnPathHost =
      domain.returnPathHost ?? process.env.SMTP_BOUNCE_HOST ?? "bounce.nani.dns";
    const envelopeFrom = `bounce+${messageId}@${returnPathHost}`;

    // --- 4. Persist durably ----------------------------------------------
    // Metadata and raw MIME commit together. An EmailMessage without its blob
    // is an undeliverable orphan the sweeper would retry forever.
    try {
      await this.prisma.$transaction([
        this.prisma.emailMessage.create({
          data: {
            id: messageId,
            tenantId: input.session.tenantId,
            domainId: domain.id,
            credentialId: input.session.credentialId,
            source: "SMTP",
            headerFrom: headerFromAddress,
            headerFromName: headers.fromName,
            envelopeFrom,
            submittedMailFrom: input.submittedMailFrom,
            replyTo: headers.replyTo,
            recipients: input.recipients,
            subject: headers.subject?.slice(0, 998) ?? null,
            messageIdHeader: headers.messageIdHeader,
            sizeBytes: input.raw.byteLength,
            status: "QUEUED",
            remoteIp: input.remoteIp,
            sessionId: input.smtpSessionId,
            // contentText / contentHtml stay null: for SMTP submissions the raw
            // MIME is the source of truth, not a flattened rendering of it.
          },
        }),
        this.prisma.emailMessageBlob.create({
          data: { messageId, mime: new Uint8Array(input.raw) },
        }),
        this.prisma.emailEvent.create({
          data: { messageId, type: "QUEUED" },
        }),
      ]);
    } catch (error) {
      // Nothing is durable, so the client must keep the message. 451, not 550.
      const detail = error instanceof Error ? error.message : "unknown";
      this.logger.error(`Durable write failed for ${messageId}: ${detail}`);
      throw queueUnavailable();
    }

    // --- 5. Dispatch -------------------------------------------------------
    // From here the message is safe. A failed enqueue is a latency problem, not
    // a data-loss problem, so it must not become an error for the client.
    const queued = await this.queue.enqueue({
      messageId,
      tenantId: input.session.tenantId,
      domainId: domain.id,
    });

    if (!queued) {
      this.logger.warn(`${messageId} committed but not dispatched; sweeper will pick it up`);
    }

    this.logger.log(
      `Accepted ${messageId} from ${headerFromAddress} to ${input.recipients.length} recipient(s), ${input.raw.byteLength}B`,
    );

    return { messageId, queued };
  }

  /**
   * Extract just the header block and parse that. `mailparser` is tolerant of
   * malformed input and returns empty fields rather than throwing on most junk,
   * so a thrown error here means genuinely unparseable.
   */
  private async parseHeaders(raw: Buffer): Promise<{
    fromAddress: string | null;
    fromName: string | null;
    replyTo: string | null;
    subject: string | null;
    messageIdHeader: string | null;
  }> {
    const separator = findHeaderEnd(raw);
    const headerBlock = separator === -1 ? raw : raw.subarray(0, separator);

    try {
      const parsed = await simpleParser(headerBlock);
      const from = parsed.from?.value?.[0];

      return {
        fromAddress: from?.address?.trim().toLowerCase() ?? null,
        fromName: from?.name?.trim() || null,
        replyTo: parsed.replyTo?.value?.[0]?.address ?? null,
        subject: parsed.subject ?? null,
        messageIdHeader: parsed.messageId ?? null,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown";
      throw unparseableMime(detail);
    }
  }
}

/** Index of the CRLFCRLF (or LFLF) that ends the header block, or -1. */
function findHeaderEnd(raw: Buffer): number {
  const crlf = raw.indexOf("\r\n\r\n");
  const lf = raw.indexOf("\n\n");
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return crlf;
  return lf;
}
