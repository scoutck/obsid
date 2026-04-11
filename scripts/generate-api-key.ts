import { PrismaClient } from ".prisma/admin-client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { randomUUID, randomBytes } from "crypto";

async function main() {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    console.error("Set ADMIN_DATABASE_URL before running this script");
    process.exit(1);
  }

  const username = process.argv[2];
  if (!username) {
    console.error("Usage: npx tsx scripts/generate-api-key.ts <username> [name]");
    process.exit(1);
  }

  const name = process.argv[3] ?? "Claude Desktop";

  const authToken = process.env.ADMIN_DATABASE_AUTH_TOKEN ?? undefined;
  const adapter = new PrismaLibSql({ url, authToken });
  const prisma = new PrismaClient({ adapter });

  // Find user
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`User "${username}" not found`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Generate key: obsid_ prefix + 32 random bytes hex
  const key = "obsid_" + randomBytes(32).toString("hex");

  await prisma.apiKey.create({
    data: {
      id: randomUUID(),
      key,
      userId: user.id,
      name,
    },
  });

  console.log(`\nAPI key for ${username} (${name}):\n${key}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
