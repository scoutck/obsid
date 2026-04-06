import { PrismaClient } from ".prisma/admin-client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { randomUUID } from "crypto";

async function main() {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    console.error("Set ADMIN_DATABASE_URL before running this script");
    process.exit(1);
  }

  const authToken = process.env.ADMIN_DATABASE_AUTH_TOKEN ?? undefined;
  const adapter = new PrismaLibSql({ url, authToken });
  const prisma = new PrismaClient({ adapter });

  const code = randomUUID().slice(0, 8) + "-" + randomUUID().slice(0, 8);

  await prisma.inviteCode.create({
    data: {
      id: randomUUID(),
      code,
    },
  });

  console.log(`\nInvite code: ${code}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
