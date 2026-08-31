import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const NANI_SECRET = process.env.SEED_SMTP_SECRET ?? "nani_smtp_localtest";
const FIXTURE_SECRET = `${NANI_SECRET}_fixture`;

/**
 * Seeds a sending domain and SMTP credential for local testing.
 *
 * `nani.africa` is deliberately the primary one: it is already a verified SES
 * identity with Easy DKIM, so mail sent through the relay actually leaves AWS
 * and lands in a real inbox. `mail.example.com` is kept as an offline fixture —
 * the relay accepts it, but SES will reject it because we do not control that
 * domain's DNS and it is not an SES identity.
 */
async function main() {
  // Anchor to the account the local UI signs in as, not whichever tenant sorts
  // first — those differ, and the mismatch reads as an authorisation bug.
  const user = await prisma.user.findUnique({ where: { email: "user@solucien.local" } });
  if (!user) throw new Error("Run the main seed first (no user@solucien.local)");
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant) throw new Error("Preview user has no tenant");

  // --- Real sending domain: verified in SES, delivers for real ---------------
  const nani = await prisma.domain.upsert({
    where: { name: "nani.africa" },
    update: {
      tenantId: tenant.id,
      sendingVerification: "VERIFIED",
      operationalStatus: "ACTIVE",
    },
    create: {
      name: "nani.africa",
      tld: "africa",
      zone: "nani.africa.",
      owner: tenant.name,
      tenantId: tenant.id,
      sendingVerification: "VERIFIED",
      operationalStatus: "ACTIVE",
      returnPathHost: "bounce.nani.africa",
    },
  });

  await prisma.smtpCredential.upsert({
    where: { username: "postmaster@nani.africa" },
    update: { tenantId: tenant.id, domainId: nani.id, status: "ACTIVE" },
    create: {
      name: "Local test credential (nani.africa)",
      username: "postmaster@nani.africa",
      prefix: NANI_SECRET.slice(0, 16),
      secretHash: createHash("sha256").update(NANI_SECRET).digest("hex"),
      tenantId: tenant.id,
      domainId: nani.id,
      createdById: user.id,
    },
  });

  // --- Offline fixture: accepted by the relay, rejected by SES ---------------
  const fixture = await prisma.domain.upsert({
    where: { name: "mail.example.com" },
    update: { tenantId: tenant.id, sendingVerification: "VERIFIED", operationalStatus: "ACTIVE" },
    create: {
      name: "mail.example.com",
      tld: "com",
      zone: "mail.example.com.",
      owner: tenant.name,
      tenantId: tenant.id,
      sendingVerification: "VERIFIED",
      operationalStatus: "ACTIVE",
      returnPathHost: "bounce.mail.example.com",
    },
  });

  await prisma.smtpCredential.upsert({
    where: { username: "postmaster@mail.example.com" },
    update: { tenantId: tenant.id, domainId: fixture.id, status: "ACTIVE" },
    create: {
      name: "Local test credential (fixture)",
      username: "postmaster@mail.example.com",
      prefix: FIXTURE_SECRET.slice(0, 16),
      secretHash: createHash("sha256").update(FIXTURE_SECRET).digest("hex"),
      tenantId: tenant.id,
      domainId: fixture.id,
      createdById: user.id,
    },
  });

  // --- Second tenant, for the cross-workspace rejection test -----------------
  const other = await prisma.tenant.upsert({
    where: { slug: "smtp-test-other" },
    update: {},
    create: { name: "Other Workspace", slug: "smtp-test-other" },
  });

  await prisma.domain.upsert({
    where: { name: "notyours.example.com" },
    update: { tenantId: other.id },
    create: {
      name: "notyours.example.com",
      tld: "com",
      zone: "notyours.example.com.",
      owner: other.name,
      tenantId: other.id,
      sendingVerification: "VERIFIED",
      operationalStatus: "ACTIVE",
    },
  });

  console.log("Seeded for tenant:", tenant.name);
  console.log("  Real delivery : postmaster@nani.africa        /", NANI_SECRET);
  console.log("  Offline test  : postmaster@mail.example.com   /", FIXTURE_SECRET);
}

main().finally(() => prisma.$disconnect());
