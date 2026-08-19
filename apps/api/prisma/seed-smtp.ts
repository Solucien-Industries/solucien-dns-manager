import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SECRET = "nani_smtp_localtest";

async function main() {
  const tenant = await prisma.tenant.findFirst();
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  if (!tenant || !user) throw new Error("Run the main seed first");

  const domain = await prisma.domain.upsert({
    where: { name: "mail.example.com" },
    update: { sendingVerification: "VERIFIED", operationalStatus: "ACTIVE" },
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
    update: {},
    create: {
      name: "Local test credential",
      username: "postmaster@mail.example.com",
      prefix: SECRET.slice(0, 16),
      secretHash: createHash("sha256").update(SECRET).digest("hex"),
      tenantId: tenant.id,
      domainId: domain.id,
      createdById: user.id,
    },
  });

  const other = await prisma.tenant.upsert({
    where: { slug: "smtp-test-other" },
    update: {},
    create: { name: "Other Workspace", slug: "smtp-test-other" },
  });

  await prisma.domain.upsert({
    where: { name: "notyours.example.com" },
    update: {},
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

  console.log("Seeded. User: postmaster@mail.example.com  Pass:", SECRET);
}

main().finally(() => prisma.$disconnect());
