import { HttpException, HttpStatus } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

const smsRateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

export function normalizeSmsRecipient(to: string): string {
  const trimmed = to.trim().replace(/[\s()\-]/g, "");
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

export function validateSmsPayload(to: string, message: string): string[] {
  const errors: string[] = [];
  const normalizedTo = normalizeSmsRecipient(to);

  if (!/^\+[1-9]\d{5,14}$/.test(normalizedTo)) {
    errors.push("to must be a valid phone number");
  }

  if (!message.trim()) {
    errors.push("message is required");
  } else if (message.trim().length > 160) {
    errors.push("message must be 160 characters or fewer");
  }

  return errors;
}

export async function checkSmsRateLimit(redis: RedisService, apiKeyId: string): Promise<void> {
  const windowMs = 60 * 1000;
  const maxRequests = 100;
  const now = Date.now();
  const key = `sms:rate:${apiKeyId}`;

  try {
    const count = await redis.client.incr(key);
    if (count === 1) {
      await redis.client.expire(key, Math.ceil(windowMs / 1000));
    }
    if (count > maxRequests) {
      await redis.client.decr(key);
      throw new HttpException("Too many SMS requests, please retry later.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return;
  } catch (error) {
    if (error instanceof HttpException) throw error;
  }

  const bucket = smsRateLimitBuckets.get(apiKeyId) ?? { count: 0, windowStart: now };
  if (now - bucket.windowStart > windowMs) {
    smsRateLimitBuckets.set(apiKeyId, { count: 1, windowStart: now });
    return;
  }

  if (bucket.count >= maxRequests) {
    throw new HttpException("Too many SMS requests, please retry later.", HttpStatus.TOO_MANY_REQUESTS);
  }

  bucket.count += 1;
  smsRateLimitBuckets.set(apiKeyId, bucket);
}
