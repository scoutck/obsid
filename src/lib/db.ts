import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { getUserDb } from "./user-db";

// Local dev singleton
function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const localPrisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = localPrisma;

/**
 * Request-scoped DB access. In production, reads user DB credentials
 * from headers injected by proxy.ts. In dev, returns the local singleton.
 */
export function getDb(request?: Request): PrismaClient {
  if (request) {
    const url = request.headers.get("x-user-db-url");
    const token = request.headers.get("x-user-db-token");
    if (url && token) {
      return getUserDb(url, token);
    }
  }
  return localPrisma;
}

// Backwards-compatible export for lib files that import { prisma }
// In production, this returns the local client (unused — API routes use getDb()).
// In dev, this is the working client.
export const prisma = localPrisma;
