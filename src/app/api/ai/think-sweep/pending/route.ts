import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getLastThinkAt } from "@/lib/user-insights";

export async function GET(request: NextRequest) {
  const db = getDb(request);

  const lastThinkAt = await getLastThinkAt(db);

  let raw;
  if (lastThinkAt) {
    raw = await db.note.findMany({
      where: {
        updatedAt: { gt: lastThinkAt },
        type: { not: "person" },
      },
      orderBy: { updatedAt: "asc" },
      select: { id: true, title: true, updatedAt: true },
    });
  } else {
    raw = await db.note.findMany({
      where: {
        type: { not: "person" },
      },
      orderBy: { updatedAt: "asc" },
      select: { id: true, title: true, updatedAt: true },
    });
  }

  return Response.json({
    notes: raw.map((n) => ({ id: n.id, title: n.title })),
    lastThinkAt: lastThinkAt?.toISOString() ?? null,
    total: raw.length,
  });
}
