import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getLastThinkAt } from "@/lib/user-insights";
import { triageNote, upsertTriage, getTriagesForNotes } from "@/lib/think-triage";
import { runThinkExploration } from "@/lib/think-pipeline";
import { buildSynthesisMessages } from "@/lib/think-synthesizer";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const cookie = request.headers.get("cookie") ?? "";
  const anthropic = new Anthropic();

  // 1. Get pending notes (same logic as pending endpoint)
  const lastThinkAt = await getLastThinkAt(db);
  let raw;
  if (lastThinkAt) {
    raw = await db.note.findMany({
      where: { updatedAt: { gt: lastThinkAt }, type: { not: "person" } },
      orderBy: { updatedAt: "asc" },
      select: { id: true, title: true, content: true, updatedAt: true },
    });
  } else {
    raw = await db.note.findMany({
      where: { type: { not: "person" } },
      orderBy: { updatedAt: "asc" },
      select: { id: true, title: true, content: true, updatedAt: true },
    });
  }

  // Filter by existing triage
  const noteIds = raw.map((n) => n.id);
  const triages = await getTriagesForNotes(noteIds, db);
  const candidates = raw.filter((n) => {
    const triage = triages.get(n.id);
    if (!triage) return true;
    if (n.updatedAt > triage.triagedAt) return true;
    return triage.worthy;
  });

  // 2. Triage untriaged candidates
  const toProcess: typeof candidates = [];
  for (const note of candidates) {
    const triage = triages.get(note.id);
    const needsRetriage = !triage || note.updatedAt > triage.triagedAt;

    if (needsRetriage) {
      const result = await triageNote(note.title, note.content);
      await upsertTriage(note.id, result.worthy, result.reason, db);
      if (result.worthy) toProcess.push(note);
    } else {
      toProcess.push(note);
    }
  }

  if (toProcess.length === 0) {
    return Response.json({ batchId: null, total: 0, message: "No notes to process" });
  }

  // 3. Run stages 1-3 for all notes and store intermediate results
  const batchId = crypto.randomUUID();
  const batchRequests: Anthropic.Beta.Messages.BatchCreateParams.Request[] = [];

  for (const note of toProcess) {
    const exploration = await runThinkExploration(note.id, db, cookie);
    if (!exploration) continue;

    const customId = `think-${note.id}`;
    const { system, messages } = buildSynthesisMessages(
      exploration.noteTitle,
      exploration.noteContent,
      exploration.plan,
      exploration.explorerResults,
      exploration.knownPeople
    );

    // Store intermediate data for result processing
    await db.thinkBatchItem.create({
      data: {
        batchId,
        noteId: note.id,
        customId,
        noteTitle: exploration.noteTitle,
        noteContent: exploration.noteContent,
        explorationPlan: JSON.stringify(exploration.plan),
        explorerResults: JSON.stringify(exploration.explorerResults),
        knownPeople: JSON.stringify(exploration.knownPeople),
        status: "pending",
      },
    });

    batchRequests.push({
      custom_id: customId,
      params: {
        model: "claude-opus-4-6",
        max_tokens: 4000,
        system,
        messages,
        thinking: { type: "enabled", budget_tokens: 10000 },
      },
    });
  }

  if (batchRequests.length === 0) {
    return Response.json({ batchId: null, total: 0, message: "No notes to process" });
  }

  // 4. Submit batch
  const batch = await anthropic.beta.messages.batches.create({
    requests: batchRequests,
  });

  // Update all items with the real Anthropic batch ID
  await db.thinkBatchItem.updateMany({
    where: { batchId },
    data: { batchId: batch.id },
  });

  return Response.json({
    batchId: batch.id,
    total: batchRequests.length,
    message: `Batch submitted — ${batchRequests.length} notes queued`,
  });
}
