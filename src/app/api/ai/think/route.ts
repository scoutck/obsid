import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { runThinkPipeline } from "@/lib/think-pipeline";

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const cookie = request.headers.get("cookie") ?? "";
  const { noteId, mode } = await request.json();

  if (!noteId) {
    return Response.json({ error: "noteId is required" }, { status: 400 });
  }

  // Live mode: skip triage (user explicitly chose to think about this note)
  // Sweep mode: triage is handled by the caller before reaching here
  const skipTriage = mode !== "sweep";

  try {
    const result = await runThinkPipeline(noteId, db, cookie, { skipTriage });

    if (result.skipped) {
      return Response.json({
        skipped: true,
        skipReason: result.skipReason,
        connectionsAdded: false,
        insightsAdded: 0,
        connections: "",
      });
    }

    return Response.json({
      connectionsAdded: result.connectionsAdded,
      insightsAdded: result.insightsAdded,
      peopleInsightsAdded: result.peopleInsightsAdded,
      connections: result.connections,
    });
  } catch (err) {
    console.error("[think] Pipeline failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Think pipeline failed" },
      { status: 502 },
    );
  }
}
