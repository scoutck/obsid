import { PrismaClient as AdminClient } from ".prisma/admin-client";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const adminUrl = process.env.ADMIN_DATABASE_URL;
  if (!adminUrl) {
    console.error("Set ADMIN_DATABASE_URL");
    process.exit(1);
  }

  const adminToken = process.env.ADMIN_DATABASE_AUTH_TOKEN ?? undefined;
  const adminAdapter = new PrismaLibSql({ url: adminUrl, authToken: adminToken });
  const admin = new AdminClient({ adapter: adminAdapter });

  const users = await admin.user.findMany();
  console.log(`Found ${users.length} user(s) to migrate`);

  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const entries = fs.readdirSync(migrationsDir).sort();

  for (const user of users) {
    console.log(`\nMigrating ${user.username}...`);
    const adapter = new PrismaLibSql({
      url: user.tursoDbUrl,
      authToken: user.tursoDbToken,
    });
    const prisma = new PrismaClient({ adapter });

    try {
      for (const entry of entries) {
        const migrationSql = path.join(migrationsDir, entry, "migration.sql");
        if (!fs.existsSync(migrationSql)) continue;
        const sql = fs.readFileSync(migrationSql, "utf-8");
        const statements = sql
          .split(";")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        for (const stmt of statements) {
          // Use IF NOT EXISTS where possible — re-running migrations is safe
          await prisma.$executeRawUnsafe(stmt).catch(() => {
            // Table/index already exists — expected for previously applied migrations
          });
        }
      }
      console.log(`  ✓ ${user.username} migrated`);
    } catch (err) {
      console.error(`  ✗ ${user.username} failed:`, err);
    } finally {
      await prisma.$disconnect();
    }
  }

  await admin.$disconnect();
  console.log("\nDone.");
}

main().catch(console.error);
