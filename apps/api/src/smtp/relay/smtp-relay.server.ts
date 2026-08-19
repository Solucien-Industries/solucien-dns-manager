import { readFileSync } from "fs";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { SMTPServer, type SMTPServerAddress, type SMTPServerSession } from "smtp-server";
import { MessageIntakeService } from "./message-intake.service";
import { SmtpAuthService, type SmtpSessionContext } from "./smtp-auth.service";
import {
  malformedRecipient,
  messageTooLarge,
  SmtpResponseError,
  tooManyRecipients,
} from "./smtp-errors";

/** Per-connection state the protocol handlers build up across commands. */
type RelaySession = SMTPServerSession & {
  nani?: SmtpSessionContext;
};

const DEFAULT_MAX_SIZE = 26_214_400; // 25 MiB, matching SES's own limit
const DEFAULT_MAX_RECIPIENTS = 50;

/**
 * The Nani SMTP submission relay — the thing `smtp.nani.dns` has been pointing
 * at in the docs.
 *
 * Runs as a plain TCP listener inside the Nest process, started and stopped with
 * the app lifecycle. It is deliberately NOT an HTTP controller: SMTP is its own
 * protocol on its own port.
 *
 * Two listeners, per story 5:
 *   587 — submission, STARTTLS required before AUTH
 *   465 — implicit TLS
 */
@Injectable()
export class SmtpRelayServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmtpRelayServer.name);
  private servers: SMTPServer[] = [];

  constructor(
    private readonly auth: SmtpAuthService,
    private readonly intake: MessageIntakeService,
  ) {}

  private get maxSize(): number {
    return Number(process.env.SMTP_MAX_MESSAGE_BYTES ?? DEFAULT_MAX_SIZE);
  }

  private get maxRecipients(): number {
    return Number(process.env.SMTP_MAX_RECIPIENTS ?? DEFAULT_MAX_RECIPIENTS);
  }

  onModuleInit(): void {
    if (process.env.SMTP_RELAY_ENABLED === "false") {
      this.logger.warn("SMTP relay disabled by SMTP_RELAY_ENABLED=false");
      return;
    }

    const tls = this.loadTls();
    const submissionPort = Number(process.env.SMTP_RELAY_PORT ?? 587);
    const implicitTlsPort = Number(process.env.SMTP_RELAY_TLS_PORT ?? 465);

    // Port 587: cleartext connect, STARTTLS upgrade, then AUTH.
    // `hideSTARTTLS: false` + `authOptional: false` means smtp-server refuses
    // AUTH until the socket is upgraded, which is what story 5 requires.
    this.listen(submissionPort, {
      secure: false,
      ...tls,
    });

    // Port 465: TLS from the first byte.
    if (tls.key && tls.cert) {
      this.listen(implicitTlsPort, { secure: true, ...tls });
    } else {
      this.logger.warn(
        `Implicit TLS listener on ${implicitTlsPort} not started: set SMTP_TLS_KEY_PATH and SMTP_TLS_CERT_PATH`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      this.servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  }

  private loadTls(): { key?: Buffer; cert?: Buffer } {
    const keyPath = process.env.SMTP_TLS_KEY_PATH;
    const certPath = process.env.SMTP_TLS_CERT_PATH;
    if (!keyPath || !certPath) return {};
    try {
      return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown";
      this.logger.error(`Could not read TLS material: ${detail}`);
      return {};
    }
  }

  private listen(port: number, options: { secure: boolean; key?: Buffer; cert?: Buffer }): void {
    const server = new SMTPServer({
      name: process.env.SMTP_RELAY_HOSTNAME ?? "smtp.nani.dns",
      banner: "Nani SMTP relay",
      secure: options.secure,
      key: options.key,
      cert: options.cert,

      

      authOptional: false,
      allowInsecureAuth: false,
      authMethods: ["PLAIN", "LOGIN"],
      socketTimeout: 300000,

      onAuth: (credentials, session, callback) => {
        this.handleAuth(credentials, session as RelaySession, callback).catch((err: Error) => {
          this.logger.error(`Auth handler failed: ${err.message}`);
          callback(new SmtpResponseError(451, "4.3.0 Temporary failure, please retry"));
        });
      },
      onMailFrom: (address, session, callback) => {
        this.handleMailFrom(address, session as RelaySession, callback);
      },
      onRcptTo: (address, session, callback) => {
        this.handleRcptTo(address, session as RelaySession, callback);
      },
      onData: (stream, session, callback) => {
        this.handleData(stream, session as RelaySession, callback).catch((err: Error) => {
          this.logger.error(`Data handler failed: ${err.message}`);
          callback(new SmtpResponseError(451, "4.3.0 Temporary failure, please retry"));
        });
      },
    });

    server.on("error", (error: Error) => {
      this.logger.error(`SMTP server error on :${port} — ${error.message}`);
    });

    server.listen(port, () => {
      this.logger.log(`SMTP relay listening on :${port} (${options.secure ? "implicit TLS" : "STARTTLS"})`);
    });

    this.servers.push(server);
  }

  /* -------------------------------------------------------------------- */
  /* Protocol handlers                                                     */
  /* -------------------------------------------------------------------- */

  private async handleAuth(
    credentials: { username?: string; password?: string },
    session: RelaySession,
    callback: (err: Error | null, response?: { user: string }) => void,
  ): Promise<void> {
    const context = await this.auth.authenticate(
      credentials.username ?? "",
      credentials.password ?? "",
      session.remoteAddress ?? "unknown",
    );

    if (!context) {
      // One reply for every failure mode — see SmtpAuthService.
      callback(new SmtpResponseError(535, "5.7.8 Authentication credentials invalid"));
      return;
    }

    session.nani = context;
    callback(null, { user: context.username });
  }

  /**
   * The envelope sender. We accept it here and authorise the *header* From at
   * DATA time, because the header is not visible yet — a client can legitimately
   * send MAIL FROM:<> (a bounce) or a different local-part.
   */
  private handleMailFrom(
    address: SMTPServerAddress,
    session: RelaySession,
    callback: (err?: Error | null) => void,
  ): void {
    if (!session.nani) {
      callback(new SmtpResponseError(530, "5.7.0 Authentication required"));
      return;
    }

    const declaredSize = Number((address.args as { SIZE?: string })?.SIZE ?? 0);
    if (declaredSize > this.maxSize) {
      callback(messageTooLarge(this.maxSize));
      return;
    }

    callback();
  }

  private handleRcptTo(
    address: SMTPServerAddress,
    session: RelaySession,
    callback: (err?: Error | null) => void,
  ): void {
    if (!session.nani) {
      callback(new SmtpResponseError(530, "5.7.0 Authentication required"));
      return;
    }

    if (session.envelope.rcptTo.length >= this.maxRecipients) {
      callback(tooManyRecipients(this.maxRecipients));
      return;
    }

    if (!isPlausibleAddress(address.address)) {
      callback(malformedRecipient(address.address));
      return;
    }

    callback();
  }

  
  private async handleData(
    stream: NodeJS.ReadableStream & { sizeExceeded?: boolean },
    session: RelaySession,
    callback: (err?: Error | null, message?: string) => void,
  ): Promise<void> {
    if (!session.nani) {
      callback(new SmtpResponseError(530, "5.7.0 Authentication required"));
      return;
    }

    this.logger.log(`DATA started for session ${session.id}`); // TEMP DEBUG

    let collected: { buffer: Buffer; exceeded: boolean };
    try {
      collected = await collect(stream, this.maxSize);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown";
      this.logger.error(`Stream failure during DATA: ${detail}`);
      callback(new SmtpResponseError(451, "4.3.0 Temporary failure, please retry"));
      return;
    }

    this.logger.log( // TEMP DEBUG
      `DATA collected ${collected.buffer.length}B exceeded=${collected.exceeded} sizeExceeded=${stream.sizeExceeded}`,
    );

    if (collected.exceeded || stream.sizeExceeded) {
      callback(messageTooLarge(this.maxSize));
      return;
    }

    const raw = collected.buffer;

    try {
      const result = await this.intake.accept({
        session: session.nani,
        submittedMailFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
        recipients: session.envelope.rcptTo.map((rcpt) => rcpt.address),
        raw,
        remoteIp: session.remoteAddress ?? "unknown",
        smtpSessionId: session.id,
      });

      callback(null, `2.0.0 Queued as ${result.messageId}`);
    } catch (error) {
      if (error instanceof SmtpResponseError) {
        callback(error);
        return;
      }
      const detail = error instanceof Error ? error.message : "unknown";
      this.logger.error(`Unhandled intake failure: ${detail}`);
      callback(new SmtpResponseError(451, "4.3.0 Temporary failure, please retry"));
    }
  }
}


function collect(
  stream: NodeJS.ReadableStream,
  limit: number,
): Promise<{ buffer: Buffer; exceeded: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let exceeded = false;

    stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) {
        exceeded = true;
        return; // drain without retaining
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve({ buffer: Buffer.concat(chunks), exceeded }));
    stream.on("error", reject);
  });
}

/**
 * Cheap syntactic sanity check. Deliberately permissive — RFC 5321 allows far
 * stranger addresses than most validators admit, and rejecting a deliverable
 * address is worse than accepting one that bounces later.
 */
function isPlausibleAddress(address: string): boolean {
  if (!address || address.length > 320) return false;
  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) return false;
  const domain = address.slice(at + 1);
  return domain.includes(".") && !/\s/.test(address);
}
