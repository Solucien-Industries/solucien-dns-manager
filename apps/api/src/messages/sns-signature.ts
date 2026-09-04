import { createVerify } from "crypto";
import { BadRequestException, Logger } from "@nestjs/common";

const logger = new Logger("SnsSignature");
const certificateCache = new Map<string, string>();

export type SnsEnvelope = {
  Type?: string;
  MessageId?: string;
  TopicArn?: string;
  Token?: string;
  SubscribeURL?: string;
  Subject?: string;
  Message?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
};

/**
 * Authenticity for the SES event webhook.
 *
 * The endpoint previously used a shared `x-nani-webhook-secret` header, which
 * cannot work: SNS HTTPS subscriptions have no facility for custom headers, so
 * that check would reject every real event Amazon sent. The signature on the
 * message body is the mechanism AWS actually provides.
 *
 * It is also the only thing protecting the endpoint. Anyone who finds the URL
 * can otherwise post a fabricated complaint for any message — and with
 * automatic suspension running, a handful of forged complaints would take a
 * competitor's sending domain offline.
 */
export async function assertSnsAuthentic(raw: unknown): Promise<SnsEnvelope> {
  const envelope = (raw ?? {}) as SnsEnvelope;
  if (!envelope.Type) throw new BadRequestException("Not an SNS message.");

  if (process.env.SNS_VERIFY_SIGNATURES === "false") {
    logger.warn("SNS signature verification disabled — local testing only");
    return envelope;
  }

  const url = envelope.SigningCertURL ?? "";
  // The certificate URL arrives inside the message we are trying to verify, so
  // it has to be constrained to AWS. Without this an attacker signs with their
  // own key and points us at their own certificate.
  if (!/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//.test(url)) {
    throw new BadRequestException("Untrusted SNS signing certificate URL.");
  }

  if (!envelope.Signature) throw new BadRequestException("SNS message is unsigned.");

  const certificate = await fetchCertificate(url);
  const verifier = createVerify(envelope.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
  verifier.update(canonicalString(envelope), "utf8");

  if (!verifier.verify(certificate, envelope.Signature, "base64")) {
    throw new BadRequestException("SNS signature did not verify.");
  }

  return envelope;
}

/**
 * SNS sends this once when a subscription is created and will deliver nothing
 * until we fetch the URL. Skipping it means the wiring looks correct in the
 * console and no events ever arrive.
 */
export async function confirmSubscriptionIfNeeded(envelope: SnsEnvelope): Promise<boolean> {
  if (envelope.Type !== "SubscriptionConfirmation" || !envelope.SubscribeURL) return false;

  // Only reachable once the signature has verified, so this cannot be used to
  // make the server call an arbitrary host.
  const res = await fetch(envelope.SubscribeURL);
  if (!res.ok) throw new BadRequestException("Could not confirm the SNS subscription.");

  logger.log(`Confirmed SNS subscription for ${envelope.TopicArn ?? "unknown topic"}`);
  return true;
}

async function fetchCertificate(url: string): Promise<string> {
  const cached = certificateCache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) throw new BadRequestException("Could not fetch the SNS signing certificate.");

  const pem = await res.text();
  certificateCache.set(url, pem);
  return pem;
}

/**
 * AWS signs a fixed set of fields in a fixed order, and omits absent optional
 * ones (Subject) entirely rather than signing an empty value.
 */
function canonicalString(envelope: SnsEnvelope): string {
  const fields =
    envelope.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];

  let canonical = "";
  for (const field of fields) {
    const value = (envelope as Record<string, string | undefined>)[field];
    if (value === undefined) continue;
    canonical += `${field}\n${value}\n`;
  }
  return canonical;
}
