/**
 * SMTP response errors.
 *
 * The `smtp-server` package turns a thrown/returned Error into a reply using
 * `err.responseCode` and `err.message`. Getting the class right matters more
 * than the wording: a 4xx tells the client "retry later and keep the message",
 * a 5xx tells it "give up and bounce to your user". Returning 5xx for what is
 * really a transient fault (our DB is down) makes customers lose mail they
 * would otherwise have re-sent successfully.
 *
 * Spec: Critical Validation Rules — "The relay should return standards-compliant
 * 4xx temporary and 5xx permanent errors."
 */
export class SmtpResponseError extends Error {
  constructor(
    readonly responseCode: number,
    message: string,
  ) {
    super(message);
    this.name = "SmtpResponseError";
  }
}

/* ---------- Permanent (5xx): the client must not retry ---------- */

/** Sender domain is not registered, not verified, or belongs to another workspace. */
export const senderNotAuthorised = (domain: string) =>
  new SmtpResponseError(550, `5.7.1 Sender domain ${domain} is not authorised for this credential`);

/** Domain exists and is owned, but policy currently forbids sending. */
export const domainNotSendable = (domain: string, state: string) =>
  new SmtpResponseError(550, `5.7.1 Domain ${domain} is not permitted to send (state: ${state})`);

export const malformedSender = () =>
  new SmtpResponseError(501, "5.1.7 Malformed sender address");

export const malformedRecipient = (address: string) =>
  new SmtpResponseError(501, `5.1.3 Malformed recipient address: ${address}`);

export const tooManyRecipients = (limit: number) =>
  new SmtpResponseError(452, `4.5.3 Too many recipients (limit ${limit})`);

/** 552 rather than 554: the message is too big, not permanently unacceptable. */
export const messageTooLarge = (limitBytes: number) =>
  new SmtpResponseError(552, `5.3.4 Message exceeds maximum size of ${limitBytes} bytes`);

export const unparseableMime = (detail: string) =>
  new SmtpResponseError(550, `5.6.0 Message could not be parsed: ${detail}`);

export const missingFromHeader = () =>
  new SmtpResponseError(550, "5.6.0 Message is missing a valid From header");

/**
 * Header From and envelope MAIL FROM resolve to different domains, and the
 * credential is not authorised for both. Spec story 6 requires these be
 * validated separately.
 */
export const fromHeaderMismatch = () =>
  new SmtpResponseError(550, "5.7.1 From header domain is not authorised for this credential");

/* ---------- Transient (4xx): the client should retry ---------- */

/**
 * Our storage or queue is unavailable. This is the single most important error
 * in the file: if we cannot durably record the message, we must NOT return 250.
 * A 451 keeps the message on the client's queue for a later retry.
 */
export const queueUnavailable = () =>
  new SmtpResponseError(451, "4.3.0 Message could not be queued, please retry");

export const rateLimited = () =>
  new SmtpResponseError(451, "4.7.0 Submission rate limit exceeded, please retry later");
