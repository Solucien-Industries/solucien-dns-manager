/**
 * Seeds a fresh database with a demo tenant, user, and the sample domains/records
 * defined in @solucien/shared. Run with: npm run prisma:seed (workspace: @solucien/api)
 */
import { PrismaClient } from "@prisma/client";
import { seedDomains, seedRecords } from "@solucien/shared";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "solucien-industries" },
    update: {},
    create: { name: "Solucien Industries", slug: "solucien-industries" },
  });

  await prisma.user.upsert({
    where: { email: "ops@soluciendns.com" },
    update: {},
    create: {
      email: "ops@soluciendns.com",
      name: "Solucien Ops",
      role: "OWNER",
      tenantId: tenant.id,
    },
  });

  for (const d of seedDomains) {
    const domain = await prisma.domain.upsert({
      where: { name: d.name },
      update: {},
      create: {
        name: d.name,
        tld: d.tld,
        zone: d.zone,
        status: d.status,
        owner: d.owner,
        nameservers: d.nameservers,
        uptime: d.uptime,
        tenantId: tenant.id,
      },
    });

    const recordsForDomain = seedRecords.filter((r) => r.domain === d.name);
    for (const r of recordsForDomain) {
      await prisma.dnsRecord.create({
        data: {
          type: r.type,
          name: r.name,
          value: r.value,
          ttl: r.ttl,
          priority: r.priority ?? null,
          domainId: domain.id,
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
