import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  Module,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, Length, Matches } from "class-validator";
import type { Request } from "express";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { JwtOrApiKeyGuard } from "../api-keys/jwt-or-api-key.guard";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { checkSmsRateLimit, normalizeSmsRecipient, validateSmsPayload } from "./sms-legacy-bridge";

class SendSmsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{5,14}$/, { message: "to must be a valid phone number" })
  to!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 160)
  message!: string;

  @IsOptional()
  @IsString()
  from?: string;
}

function normalizeSendSmsPayload(input: SmsSendInput): SmsSendInput {
  return {
    ...input,
    to: normalizeSmsRecipient(input.to),
  };
}

export type SmsSendInput = SendSmsDto & { tenantId: string; userId?: string };

export type SmsSendResult = {
  provider: string;
  status: string;
  messageId: string;
  to: string;
  message: string;
  tenantId: string;
  note?: string;
};

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

    const bucket = smsQuotaBuckets.get(bucketKey) ?? { count: 0, periodStart };
    if (bucket.count >= limit) {
      throw new HttpException("SMS quota exceeded for this tenant.", HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count += 1;
    smsQuotaBuckets.set(bucketKey, bucket);
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

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const normalizedInput = normalizeSendSmsPayload(input);
    const validationErrors = validateSmsPayload(normalizedInput.to, normalizedInput.message);
    if (validationErrors.length > 0) {
      throw new HttpException(validationErrors.join(", "), HttpStatus.BAD_REQUEST);
    }

    await this.checkAndIncrementQuota(normalizedInput.tenantId);
    await checkSmsRateLimit(this.redis, normalizedInput.tenantId);

    const provider = (process.env.SMS_PROVIDER ?? "mock").toLowerCase();

    if (provider === "africastalking") {
      const result = await this.sendViaAfricaTalking(normalizedInput);
      await this.writeAudit(normalizedInput, 200, provider, result.messageId);
      return result;
    }

    const result = {
      provider: "mock",
      status: "queued",
      messageId: `sms_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      to: normalizedInput.to,
      message: normalizedInput.message,
      tenantId: normalizedInput.tenantId,
      note:
        "SMS mock delivery mode active. Set SMS_PROVIDER=africastalking and AT_USERNAME / AT_API_KEY to send live messages.",
    };

    await this.writeAudit(normalizedInput, 200, "mock", result.messageId);
    return result;
  }

  private async sendViaAfricaTalking(input: SmsSendInput): Promise<SmsSendResult> {
    const username = process.env.AT_USERNAME;
    const apiKey = process.env.AT_API_KEY;
    const from = input.from?.trim() || process.env.SMS_FROM || "";

    if (!username || !apiKey) {
      throw new InternalServerErrorException(
        "Africa's Talking credentials are not configured. Set AT_USERNAME and AT_API_KEY in the environment.",
      );
    }

    const response = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        username,
        apiKey,
        Authorization: `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`,
      },
      body: JSON.stringify({
        username,
        to: input.to,
        message: input.message,
        from,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.logger.error(`Africa's Talking request failed: ${JSON.stringify(payload)}`);
      throw new InternalServerErrorException("SMS provider rejected the request.");
    }

    return {
      provider: "africastalking",
      status: "queued",
      messageId:
        payload?.SMSMessageData?.Recipients?.[0]?.messageId ?? `sms_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      to: input.to,
      message: input.message,
      tenantId: input.tenantId,
    };
  }
}

@ApiTags("sms")
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyGuard)
@Controller("sms")
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @Post("send")
  async send(@Body() dto: SendSmsDto, @Req() req: Request) {
    const user = req.user as { userId?: string; tenantId?: string };
    return this.sms.send({
      ...dto,
      tenantId: user.tenantId ?? "ephemeral-tenant",
      userId: user.userId,
    });
  }
}

@Module({
  imports: [ApiKeysModule],
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
