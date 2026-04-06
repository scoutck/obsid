import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const MAX_CACHED_CLIENTS = 50;

const clientCache = new Map<
  string,
  { client: PrismaClient; lastUsed: number }
>();

export function getUserDb(url: string, authToken: string): PrismaClient {
  const existing = clientCache.get(url);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.client;
  }

  // Evict oldest if at capacity
  if (clientCache.size >= MAX_CACHED_CLIENTS) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, entry] of clientCache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      clientCache.get(oldestKey)?.client.$disconnect();
      clientCache.delete(oldestKey);
    }
  }

  const adapter = new PrismaLibSql({ url, authToken });
  const client = new PrismaClient({ adapter });
  clientCache.set(url, { client, lastUsed: Date.now() });
  return client;
}
