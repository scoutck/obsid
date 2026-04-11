import { adminPrisma } from "@/lib/admin-db";
import { getUserDb } from "@/lib/user-db";
import type { PrismaClient } from "@prisma/client";

interface McpAuthResult {
  userId: string;
  db: PrismaClient;
}

export async function validateApiKey(request: Request): Promise<McpAuthResult | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer obsid_")) return null;

  const key = authHeader.slice(7); // "Bearer ".length

  let apiKey;
  try {
    apiKey = await adminPrisma.apiKey.findUnique({ where: { key } });
  } catch {
    return null;
  }
  if (!apiKey) return null;

  // Look up user's Turso credentials
  const user = await adminPrisma.user.findUnique({
    where: { id: apiKey.userId },
  });
  if (!user) return null;

  // Update lastUsedAt (fire-and-forget)
  adminPrisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  // In dev mode, fall back to local DB
  if (process.env.NODE_ENV !== "production") {
    const { prisma } = await import("@/lib/db");
    return { userId: apiKey.userId, db: prisma };
  }

  const db = getUserDb(user.tursoDbUrl, user.tursoDbToken);
  return { userId: apiKey.userId, db };
}
