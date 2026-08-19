import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import { SesAdminService } from "./ses-admin.service";

type DomainRow = { id: string; tenantId: string; sendingVerification: "PENDING_VERIFICATION" | "VERIFYING" | "VERIFIED" | "FAILED"; operationalStatus: "ACTIVE" | "SUSPENDED" | "DISABLED" };
const domain: DomainRow = { id: "alpha", tenantId: "tenant-a", sendingVerification: "VERIFIED", operationalStatus: "ACTIVE" };
function serviceFor(row: DomainRow | null, credential: { id: string } | null = null, lookupError?: Error) {
  return new SesAdminService({ connected: true, domain: { findUnique: async () => { if (lookupError) throw lookupError; return row; } }, smtpCredential: { findFirst: async () => credential } } as unknown as PrismaService);
}

test("persistent sender authorization permits an owned verified domain", async () => {
  assert.equal((await serviceFor(domain).assertSenderDomainAllowed("alerts@alpha.com", "tenant-a")).id, "alpha");
});

test("persistent sender authorization rejects tenant/domain/status violations", async () => {
  await assert.rejects(serviceFor(domain).assertSenderDomainAllowed("admin@alpha.com", "tenant-b"), ForbiddenException);
  await assert.rejects(serviceFor(null).assertSenderDomainAllowed("admin@unknown.com", "tenant-a"), ForbiddenException);
  await assert.rejects(serviceFor({ ...domain, sendingVerification: "FAILED" }).assertSenderDomainAllowed("admin@alpha.com", "tenant-a"), ForbiddenException);
  await assert.rejects(serviceFor({ ...domain, operationalStatus: "SUSPENDED" }).assertSenderDomainAllowed("admin@alpha.com", "tenant-a"), ForbiddenException);
});

test("revoked/missing credential is rejected and database failure is fail-closed", async () => {
  await assert.rejects(serviceFor(domain).assertSenderDomainAllowed("admin@alpha.com", "tenant-a", "revoked"), ForbiddenException);
  await assert.rejects(new SesAdminService({ connected: false } as PrismaService).assertSenderDomainAllowed("admin@alpha.com", "tenant-a"), ServiceUnavailableException);
  await assert.rejects(serviceFor(domain, null, new Error("db failed")).assertSenderDomainAllowed("admin@alpha.com", "tenant-a"), /db failed/);
});
