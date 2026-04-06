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

// Lazy initialization — avoids throwing during Next.js build when env vars aren't set
export function getAdminPrisma(): PrismaClient {
  if (!globalForAdmin.adminPrisma) {
    globalForAdmin.adminPrisma = createAdminClient();
  }
  return globalForAdmin.adminPrisma;
}

// Proxy that defers client creation until first property access
export const adminPrisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getAdminPrisma() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
