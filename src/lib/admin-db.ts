import { PrismaClient } from ".prisma/admin-client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createAdminClient() {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) throw new Error("ADMIN_DATABASE_URL not set");
  const authToken = process.env.ADMIN_DATABASE_AUTH_TOKEN ?? undefined;
  const adapter = new PrismaLibSql({ url, authToken });
  return new PrismaClient({ adapter });
}

const globalForAdmin = globalThis as unknown as {
  adminPrisma: PrismaClient | undefined;
};

export const adminPrisma =
  globalForAdmin.adminPrisma ?? createAdminClient();

if (process.env.NODE_ENV !== "production")
  globalForAdmin.adminPrisma = adminPrisma;
