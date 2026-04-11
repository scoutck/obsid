import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getLastThinkAt } from "@/lib/user-insights";
import { getTriagesForNotes } from "@/lib/think-triage";

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

  // Filter out notes with existing triage that says "not worthy"
  // (only if the triage is still fresh — updatedAt <= triagedAt)
  const noteIds = raw.map((n) => n.id);
  const triages = await getTriagesForNotes(noteIds, db);

  const filtered = raw.filter((n) => {
    const triage = triages.get(n.id);
    if (!triage) return true; // No triage yet — include
    if (n.updatedAt > triage.triagedAt) return true; // Note changed since triage — re-evaluate
    return triage.worthy; // Exclude if triaged as not worthy
  });

  return Response.json({
    notes: filtered.map((n) => ({ id: n.id, title: n.title })),
    lastThinkAt: lastThinkAt?.toISOString() ?? null,
    total: filtered.length,
  });
}
