import { HttpException, HttpStatus, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { checkSmsRateLimit, normalizeSmsRecipient, validateSmsPayload } from "./sms-legacy-bridge";
import { SmsSendInput, SmsSendResult } from "./sms.dto";

const smsQuotaBuckets = new Map<string, { count: number; periodStart: string }>();

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private monthlyQuotaFor(tenantId: string): number {
    return Number(process.env.SMS_MONTHLY_LIMIT ?? 5000);
  }

  private currentPeriodStart(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }

  private async checkAndIncrementQuota(tenantId: string): Promise<void> {
    const periodStart = this.currentPeriodStart();
    const limit = this.monthlyQuotaFor(tenantId);
    const bucketKey = `${tenantId}:${periodStart}`;
    const redisKey = `sms:quota:${bucketKey}`;

    try {
      const count = await this.redis.client.incr(redisKey);
      if (count === 1) {
        await this.redis.client.expire(redisKey, 60 * 60 * 24 * 31);
      }
      if (count > limit) {
        await this.redis.client.decr(redisKey);
        throw new HttpException("SMS quota exceeded for this tenant.", HttpStatus.TOO_MANY_REQUESTS);
      }
      return;
    } catch (error) {
      if (error instanceof HttpException) throw error;
    }

    const existing = smsQuotaBuckets.get(bucketKey);
    const bucket = existing && existing.periodStart === periodStart ? existing : { count: 0, periodStart };
    if (bucket.count >= limit) {
      throw new HttpException("SMS quota exceeded for this tenant.", HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count += 1;
    smsQuotaBuckets.set(bucketKey, bucket);
  }

  /**
   * Refunds a quota unit reserved by {@link checkAndIncrementQuota} when the
   * downstream send fails, so a provider rejection never burns the tenant's
   * monthly allowance. Mirrors the Redis-first / in-memory-fallback strategy.
   */
  private async releaseQuota(tenantId: string): Promise<void> {
    const periodStart = this.currentPeriodStart();
    const bucketKey = `${tenantId}:${periodStart}`;

    try {
      await this.redis.client.decr(`sms:quota:${bucketKey}`);
      return;
    } catch {
      /* Redis unavailable — fall through to the in-memory bucket. */
    }

    const bucket = smsQuotaBuckets.get(bucketKey);
    if (bucket && bucket.count > 0) {
      bucket.count -= 1;
      smsQuotaBuckets.set(bucketKey, bucket);
    }
  }

  private randomMessageId(): string {
    return `sms_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  }

  private async writeAudit(input: SmsSendInput, statusCode: number, provider: string, messageId: string): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId: input.userId ?? input.tenantId,
          tenantId: input.tenantId,
          method: "POST",
          path: "/api/sms/send",
          statusCode,
          ip: "sms-provider",
          durationMs: null,
        },
      });
      this.logger.log(`Recorded SMS audit log for tenant ${input.tenantId} via ${provider} (messageId ${messageId})`);
    } catch (error) {
      this.logger.warn(`Failed to write SMS activity audit: ${(error as Error).message}`);
    }
  }

  private normalizeSendSmsPayload(input: SmsSendInput): SmsSendInput {
    return {
      ...input,
      to: normalizeSmsRecipient(input.to),
    };
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const normalizedInput = this.normalizeSendSmsPayload(input);
    const validationErrors = validateSmsPayload(normalizedInput.to, normalizedInput.message);
    if (validationErrors.length > 0) {
      throw new HttpException(validationErrors.join(", "), HttpStatus.BAD_REQUEST);
    }

    // Rate limit first so a throttled caller never consumes a monthly quota unit.
    await checkSmsRateLimit(this.redis, normalizedInput.tenantId);
    await this.checkAndIncrementQuota(normalizedInput.tenantId);

    const provider = (process.env.SMS_PROVIDER ?? "mock").toLowerCase();

    if (provider === "africastalking") {
      let result: SmsSendResult;
      try {
        result = await this.sendViaAfricaTalking(normalizedInput);
      } catch (error) {
        // The quota unit reserved above must not be consumed by a failed send.
        await this.releaseQuota(normalizedInput.tenantId);
        await this.writeAudit(normalizedInput, 502, provider, "-");
        throw error;
      }
      await this.writeAudit(normalizedInput, 200, provider, result.messageId);
      return result;
    }

    const result: SmsSendResult = {
      provider: "mock",
      status: "queued",
      messageId: this.randomMessageId(),
      to: normalizedInput.to,
      message: normalizedInput.message,
      tenantId: normalizedInput.tenantId,
      note:
        "SMS mock delivery mode active. Set SMS_PROVIDER=africastalking and AT_USERNAME / AT_API_KEY to send live messages.",
    };

    await this.writeAudit(normalizedInput, 200, "mock", result.messageId);
    return result;
  }

  /**
   * Resolves the Africa's Talking messaging endpoint. The sandbox is used when
   * AT_ENV is "sandbox", or auto-detected when AT_USERNAME is literally
   * "sandbox" (the fixed username every sandbox app uses). Anything else — the
   * default — targets the live API.
   */
  private africaTalkingEndpoint(username: string): string {
    const env = (process.env.AT_ENV ?? "").trim().toLowerCase();
    const sandbox = env === "sandbox" || (env !== "production" && username === "sandbox");
    return sandbox
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";
  }

  private async sendViaAfricaTalking(input: SmsSendInput): Promise<SmsSendResult> {
    const username = process.env.AT_USERNAME?.trim();
    const apiKey = process.env.AT_API_KEY?.trim();
    const from = input.from?.trim() || process.env.SMS_FROM?.trim() || "";

    if (!username || !apiKey) {
      throw new InternalServerErrorException(
        "Africa's Talking credentials are not configured. Set AT_USERNAME and AT_API_KEY in the environment.",
      );
    }

    // The classic /version1/messaging endpoint only accepts an
    // application/x-www-form-urlencoded body (a JSON body is rejected), and
    // authenticates on the `apiKey` header alone — no Basic auth.
    const body = new URLSearchParams({
      username,
      to: input.to,
      message: input.message,
    });
    if (from) body.set("from", from);

    let httpStatus: number;
    let ok: boolean;
    let raw: string;
    try {
      const response = await fetch(this.africaTalkingEndpoint(username), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          apiKey,
        },
        body,
      });
      httpStatus = response.status;
      ok = response.ok;
      raw = await response.text();
    } catch (error) {
      this.logger.error(`Africa's Talking could not be reached: ${(error as Error).message}`);
      throw new InternalServerErrorException("Could not reach the SMS provider.");
    }

    let payload: Record<string, any> = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { raw };
    }

    if (!ok) {
      this.logger.error(`Africa's Talking rejected the request (HTTP ${httpStatus}): ${raw || "<empty body>"}`);
      throw new InternalServerErrorException(`SMS provider rejected the request (HTTP ${httpStatus}).`);
    }

    // A 2xx still carries a per-recipient outcome; a failed recipient
    // (insufficient balance, invalid number, blacklist, bad sender ID, ...) is
    // not a delivered message even though the HTTP call "succeeded".
    const recipient = payload?.SMSMessageData?.Recipients?.[0];
    const accepted = recipient?.status === "Success" || Number(recipient?.statusCode) === 101;

    if (!recipient || !accepted) {
      const reason = recipient?.status || payload?.SMSMessageData?.Message || "no recipients accepted";
      this.logger.error(`Africa's Talking did not accept the message: ${JSON.stringify(payload)}`);
      throw new InternalServerErrorException(`SMS provider did not accept the message: ${reason}.`);
    }

    return {
      provider: "africastalking",
      status: "queued",
      messageId: recipient.messageId ?? this.randomMessageId(),
      to: input.to,
      message: input.message,
      tenantId: input.tenantId,
    };
  }
}
