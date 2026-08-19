import assert from "node:assert/strict";
import test from "node:test";
import { senderDomainRejection, parseSenderDomain, type SenderDomainRecord } from "./sender-authorization";

const valid: SenderDomainRecord = { id: "alpha", tenantId: "tenant-a", sendingVerification: "VERIFIED", operationalStatus: "ACTIVE" };

test("owned verified domain accepts dynamic local-parts", () => {
  assert.equal(senderDomainRejection(valid, "tenant-a"), null);
  assert.equal(parseSenderDomain("Billing <billing@ALPHA.com>"), "alpha.com");
  assert.equal(parseSenderDomain("support@alpha.com"), "alpha.com");
});

test("unknown, cross-workspace, unverified, suspended and disabled domains are rejected", () => {
  assert.match(senderDomainRejection(null, "tenant-a")!, /not authorised/);
  assert.match(senderDomainRejection(valid, "tenant-b")!, /not authorised/);
  assert.match(senderDomainRejection({ ...valid, sendingVerification: "PENDING_VERIFICATION" }, "tenant-a")!, /not verified/);
  assert.match(senderDomainRejection({ ...valid, operationalStatus: "SUSPENDED" }, "tenant-a")!, /suspended or disabled/);
  assert.match(senderDomainRejection({ ...valid, operationalStatus: "DISABLED" }, "tenant-a")!, /suspended or disabled/);
});

test("malformed sender addresses are rejected", () => {
  assert.equal(parseSenderDomain("invalid"), null);
  assert.equal(parseSenderDomain("a@@alpha.com"), null);
});
