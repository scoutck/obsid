import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { getNote, conditionalUpdateNote, updateNote } from "@/lib/notes";
import { getPersonByAlias, addNotePerson } from "@/lib/people";
import { listPeople } from "@/lib/people";
import { loadEmbeddingCache, embedNote } from "@/lib/embeddings";
import { createUserInsights } from "@/lib/user-insights";
import { extractInlineTags } from "@/lib/tags";
import { triageNote, upsertTriage, getTriageForNote } from "@/lib/think-triage";
import { runAllExplorers, type ExplorationPlan, type ExplorerResult } from "@/lib/think-explorers";
import { synthesize, type ThinkResult } from "@/lib/think-synthesizer";

export interface PipelineResult {
  skipped: boolean;
  skipReason?: string;
  connectionsAdded: boolean;
  insightsAdded: number;
  peopleInsightsAdded: number;
  connections: string;
}

async function planExploration(
  noteTitle: string,
  noteContent: string
): Promise<ExplorationPlan> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: `You are planning an exploration of a personal knowledge base to find connections to the note below. Produce a structured exploration plan.

Return valid JSON (no markdown fences):
{
  "semanticQueries": ["query1", "query2", "query3"],
  "people": ["Person Name 1", "Person Name 2"],
  "timePeriods": [{"start": "2026-01-01", "end": "2026-02-01", "why": "reason"}],
  "wikiLinks": ["Link 1", "Link 2"],
  "questions": ["Has the user's stance on X changed?", "What other decisions led to this?"]
}

Think about what this note is REALLY about — the themes beneath the surface. Plan searches that will find contradictions, evolution of thinking, recurring patterns, and causal chains. Don't just search for the obvious topic — search for the underlying tensions, emotions, and dynamics.

If the note doesn't mention specific people, time periods, or wiki-links, return empty arrays for those fields. Always provide at least 2-3 semantic queries.`,
    messages: [
      {
        role: "user",
        content: `Plan an exploration for this note:\n\nTitle: ${noteTitle}\n\n${noteContent}`,
      },
    ],
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  text = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  try {
    return JSON.parse(text) as ExplorationPlan;
  } catch {
    // Fallback plan if Sonnet fails to produce valid JSON
    return {
      semanticQueries: [noteTitle, noteContent.slice(0, 200)],
      people: [],
      timePeriods: [],
      wikiLinks: [],
      questions: [],
    };
  }
}

async function processThinkResult(
  noteId: string,
  result: ThinkResult,
  db: PrismaClient,
  cookie: string
): Promise<{ connectionsAdded: boolean; insightsAdded: number; peopleInsightsAdded: number }> {
  // Append connections to note content
  let connectionsAdded = false;
  if (result.connections && result.connections.trim()) {
    const freshNote = await getNote(noteId, db);
    if (freshNote) {
      const connectionsSection = `\n\n---\n**Connections**\n${result.connections.trim()}\n`;
      const updatedContent = freshNote.content.trimEnd() + connectionsSection;
      const finalTags = extractInlineTags(updatedContent);

      const updated = await conditionalUpdateNote(
        noteId,
        freshNote.updatedAt,
        { content: updatedContent, tags: finalTags },
        db
      );

      if (updated) {
        connectionsAdded = true;
        embedNote(noteId, freshNote.title, updatedContent, db, freshNote.summary).catch(
          (err) => console.error("[think] embedNote failed:", err)
        );
      }
    }
  }

  // Store user insights
  let insightsAdded = 0;
  if (result.insights && result.insights.length > 0) {
    const created = await createUserInsights(
      result.insights.map((i) => ({
        category: i.category,
        content: i.content,
        evidence: i.evidence ?? "",
        sourceNoteId: noteId,
        source: "think",
      })),
      db
    );
    insightsAdded = created.length;
  }

  // Route people insights to person notes
  let peopleInsightsAdded = 0;
  if (result.peopleInsights && result.peopleInsights.length > 0) {
    for (const pi of result.peopleInsights) {
      const person = await getPersonByAlias(pi.name, db);
      if (!person) continue;

      const existingNote = await getNote(person.note.id, db);
      if (!existingNote) continue;

      const timestamp = new Date().toISOString().split("T")[0];
      const appendText = `\n\n_${timestamp} (think):_ ${pi.observation}`;
      await updateNote(person.note.id, { content: existingNote.content + appendText }, db);
      await addNotePerson(noteId, person.note.id, db);
      peopleInsightsAdded++;

      // Fire-and-forget person summary regeneration
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/ai/person-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify({ personNoteId: person.note.id }),
      }).catch(() => {});
    }
  }

  return { connectionsAdded, insightsAdded, peopleInsightsAdded };
}

export async function runThinkPipeline(
  noteId: string,
  db: PrismaClient,
  cookie: string,
  options: { skipTriage?: boolean } = {}
): Promise<PipelineResult> {
  const note = await getNote(noteId, db);
  if (!note) {
    throw new Error("Note not found");
  }

  // Stage 1: Triage (skipped in live mode)
  if (!options.skipTriage) {
    const existingTriage = await getTriageForNote(noteId, db);
    const needsRetriage =
      !existingTriage || note.updatedAt.getTime() > existingTriage.triagedAt.getTime();

    if (needsRetriage) {
      const triageResult = await triageNote(note.title, note.content);
      await upsertTriage(noteId, triageResult.worthy, triageResult.reason, db);
      if (!triageResult.worthy) {
        return {
          skipped: true,
          skipReason: triageResult.reason,
          connectionsAdded: false,
          insightsAdded: 0,
          peopleInsightsAdded: 0,
          connections: "",
        };
      }
    } else if (!existingTriage.worthy) {
      return {
        skipped: true,
        skipReason: existingTriage.reason,
        connectionsAdded: false,
        insightsAdded: 0,
        peopleInsightsAdded: 0,
        connections: "",
      };
    }
  }

  // Stage 2: Plan
  console.log(`[think] Planning exploration for "${note.title}"`);
  const plan = await planExploration(note.title, note.content);

  // Stage 3: Explore (parallel)
  console.log(`[think] Running 4 explorers for "${note.title}"`);
  const embeddingCache = await loadEmbeddingCache(db);
  const explorerResults = await runAllExplorers(
    noteId,
    note.title,
    note.content,
    plan,
    { embeddingCache, cookie },
    db
  );

  // Stage 4: Synthesize (Opus)
  console.log(`[think] Synthesizing with Opus for "${note.title}"`);
  const people = await listPeople(db);
  const knownPeople = people.map((p) => p.note.title);
  const result = await synthesize(
    note.title,
    note.content,
    plan,
    explorerResults,
    knownPeople
  );

  // Process results (same as current think)
  const processed = await processThinkResult(noteId, result, db, cookie);

  return {
    skipped: false,
    ...processed,
    connections: result.connections || "",
  };
}

// Exported for batch mode — runs stages 1-3 only, returns intermediate data
export async function runThinkExploration(
  noteId: string,
  db: PrismaClient,
  cookie: string
): Promise<{
  noteTitle: string;
  noteContent: string;
  plan: ExplorationPlan;
  explorerResults: ExplorerResult[];
  knownPeople: string[];
} | null> {
  const note = await getNote(noteId, db);
  if (!note) return null;

  const plan = await planExploration(note.title, note.content);
  const embeddingCache = await loadEmbeddingCache(db);
  const explorerResults = await runAllExplorers(
    noteId,
    note.title,
    note.content,
    plan,
    { embeddingCache, cookie },
    db
  );
  const people = await listPeople(db);
  const knownPeople = people.map((p) => p.note.title);

  return { noteTitle: note.title, noteContent: note.content, plan, explorerResults, knownPeople };
}

// Exported for batch mode — processes a synthesis result after batch completes
export { processThinkResult };
