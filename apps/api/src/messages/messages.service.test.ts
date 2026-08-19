import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { MailService } from "../smtp/mail.service";
import type { SesAdminService } from "../smtp/ses-admin.service";
import { MessagesService, retryDelayMs } from "./messages.service";

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = { connected: true, ...overrides } as unknown as PrismaService;
  return new MessagesService(prisma, { isConfigured: () => true } as MailService, { assertSenderDomainAllowed: async () => ({ id: "domain-a" }) } as unknown as SesAdminService);
}
function event(type: "Delivery" | "Bounce" | "Complaint", messageId = "provider-1") { return { Type: "Notification", MessageId: `notification-${type}`, Message: JSON.stringify({ eventType: type, mail: { messageId, timestamp: "2026-08-13T12:00:00Z" } }) }; }

test("message is durably persisted before queued acceptance", async () => {
  let persisted = false;
  const service = makeService({ emailMessage: { create: async () => { await new Promise((resolve) => setTimeout(resolve, 5)); persisted = true; return { id: "internal-a", status: "QUEUED", recipients: ["to@example.com"] }; }, updateMany: async () => ({ count: 0 }) } });
  const result = await service.submit("tenant-a", { to: "to@example.com", subject: "Test", text: "Body" }, "billing@alpha.com");
  assert.equal(persisted, true); assert.equal(result.messageId, "internal-a"); assert.equal(result.status, "QUEUED");
});

test("message list/detail enforce tenant predicates", async () => {
  let listTenant = ""; let detailTenant = "";
  const service = makeService({ emailMessage: { findMany: async (args: { where: { tenantId: string } }) => { listTenant = args.where.tenantId; return []; }, findFirst: async (args: { where: { tenantId: string } }) => { detailTenant = args.where.tenantId; return null; } } });
  await service.list("tenant-a", { limit: 25 }); await assert.rejects(service.get("tenant-b", "message-a"));
  assert.equal(listTenant, "tenant-a"); assert.equal(detailTenant, "tenant-b");
});

test("SES delivery, bounce and complaint payloads map correctly", () => {
  const service = makeService();
  assert.equal(service.parseSesEvent(event("Delivery")).type, "DELIVERED");
  assert.equal(service.parseSesEvent(event("Bounce")).type, "BOUNCED");
  assert.equal(service.parseSesEvent(event("Complaint")).type, "COMPLAINED");
});

test("webhook authentication and malformed/oversized payload checks", () => {
  const previous = process.env.SES_EVENT_WEBHOOK_SECRET; process.env.SES_EVENT_WEBHOOK_SECRET = "correct";
  try { assert.throws(() => makeService().verifyWebhookSecret("wrong"), UnauthorizedException); assert.doesNotThrow(() => makeService().verifyWebhookSecret("correct")); }
  finally { if (previous === undefined) delete process.env.SES_EVENT_WEBHOOK_SECRET; else process.env.SES_EVENT_WEBHOOK_SECRET = previous; }
  assert.throws(() => makeService().parseSesEvent({ Message: "{" }), BadRequestException);
  assert.throws(() => makeService().parseSesEvent({ Message: "x".repeat(110_000) }), BadRequestException);
});

test("unknown event is safe and duplicate provider event is database-idempotent", async () => {
  let mutated = false;
  const unknown = makeService({ emailMessage: { findFirst: async () => null }, $transaction: async () => { mutated = true; } });
  assert.deepEqual(await unknown.ingestSesEvent(event("Delivery", "unknown")), { accepted: true, matched: false }); assert.equal(mutated, false);
  const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
  const service = makeService({ emailMessage: { findFirst: async () => ({ id: "internal-a" }), update: () => Promise.resolve({}) }, emailEvent: { create: () => Promise.resolve({}) }, $transaction: async () => { throw duplicate; } });
  assert.deepEqual(await service.ingestSesEvent(event("Bounce")), { accepted: true, matched: true, duplicate: true });
});

test("stale claims fail terminally and retry backoff is bounded", async () => {
  let status = "";
  const service = makeService({ emailMessage: { findMany: async () => [{ id: "stale" }], updateMany: async (args: { data: { status: string } }) => { status = args.data.status; return { count: 1 }; } } });
  assert.equal(await service.failStaleClaims(), 1); assert.equal(status, "FAILED");
  assert.equal(retryDelayMs(1), 60_000); assert.equal(retryDelayMs(20), 900_000);
});
