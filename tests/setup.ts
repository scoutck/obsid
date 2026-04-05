import { createClient } from "@libsql/client";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const testDb = path.join(root, "prisma", "test.db");
const migrationsDir = path.join(root, "prisma", "migrations");

export async function setup() {
  // Remove stale test db to start fresh each run
  if (fs.existsSync(testDb)) {
    fs.unlinkSync(testDb);
  }

  const client = createClient({ url: `file:${testDb}` });

  // Read all migration directories, sort them, and apply each in order
  const entries = fs.readdirSync(migrationsDir).sort();
  for (const entry of entries) {
    const migrationSql = path.join(migrationsDir, entry, "migration.sql");
    if (!fs.existsSync(migrationSql)) continue;

    const sql = fs.readFileSync(migrationSql, "utf-8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await client.execute(stmt);
    }
  }

  client.close();
}
