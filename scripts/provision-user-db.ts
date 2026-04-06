import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

/**
 * Provisions a new Turso database for a user:
 * 1. Creates the database via Turso Platform API
 * 2. Runs all Prisma migrations
 * 3. Sets up FTS5
 * Returns { url, authToken }
 */
export async function provisionUserDb(username: string): Promise<{
  url: string;
  authToken: string;
}> {
  const tursoToken = process.env.TURSO_API_TOKEN;
  const tursoOrg = process.env.TURSO_ORG;
  if (!tursoToken || !tursoOrg)
    throw new Error("TURSO_API_TOKEN and TURSO_ORG must be set");

  const dbName = `obsid-user-${username.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  // Create database via Turso Platform API
  const createRes = await fetch(
    `https://api.turso.tech/v1/organizations/${tursoOrg}/databases`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tursoToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: dbName, group: "default" }),
    }
  );
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Turso DB creation failed: ${err}`);
  }
  const dbInfo = await createRes.json();
  const hostname = dbInfo.database?.hostname ?? `${dbName}-${tursoOrg}.turso.io`;
  const url = `libsql://${hostname}`;

  // Create auth token for this database
  const tokenRes = await fetch(
    `https://api.turso.tech/v1/organizations/${tursoOrg}/databases/${dbName}/auth/tokens`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tursoToken}` },
    }
  );
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Turso token creation failed: ${err}`);
  }
  const tokenData = await tokenRes.json();
  const authToken = tokenData.jwt;

  // Run migrations against the new database
  const adapter = new PrismaLibSql({ url, authToken });
  const prisma = new PrismaClient({ adapter });

  // Apply migrations as raw SQL (same approach as tests/setup.ts)
  const fs = await import("fs");
  const path = await import("path");
  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const entries = fs.readdirSync(migrationsDir).sort();

  for (const entry of entries) {
    const migrationSql = path.join(migrationsDir, entry, "migration.sql");
    if (!fs.existsSync(migrationSql)) continue;
    const sql = fs.readFileSync(migrationSql, "utf-8");
    const statements = sql
      .split(";")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
  }

  // Set up FTS5
  await prisma.$executeRawUnsafe(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      id UNINDEXED, title, content, tags, content='Note', content_rowid='rowid'
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON Note BEGIN
      INSERT INTO notes_fts(id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON Note BEGIN
      DELETE FROM notes_fts WHERE id = old.id;
      INSERT INTO notes_fts(id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON Note BEGIN
      DELETE FROM notes_fts WHERE id = old.id;
    END;
  `);

  await prisma.$disconnect();

  return { url, authToken };
}
