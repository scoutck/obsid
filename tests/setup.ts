import { createClient } from "@libsql/client";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const testDb = path.join(root, "prisma", "test.db");
const migrationSql = path.join(
  root,
  "prisma",
  "migrations",
  "20260405184246_init",
  "migration.sql"
);

export async function setup() {
  // Remove stale test db to start fresh each run
  if (fs.existsSync(testDb)) {
    fs.unlinkSync(testDb);
  }

  const sql = fs.readFileSync(migrationSql, "utf-8");
  const client = createClient({ url: `file:${testDb}` });

  // Execute each statement separately
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await client.execute(stmt);
  }

  client.close();
}
