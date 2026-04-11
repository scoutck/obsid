# Multi-Agent Think Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-agent Sonnet think loop with a 4-stage pipeline (Haiku triage → Sonnet plan → Haiku×4 explore → Opus synthesize) for deeper connections and better synthesis.

**Architecture:** Four sequential stages with parallel execution in the explore stage. New lib files handle each stage independently. The existing think route becomes a thin orchestrator. Batch mode stores intermediate results in a DB table and submits Opus calls to the Anthropic Batch API.

**Tech Stack:** Anthropic SDK (`@anthropic-ai/sdk`), Prisma (SQLite), existing vault tools from `src/lib/ai-tools.ts`

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `src/lib/think-triage.ts` | Haiku triage call + NoteThinkTriage CRUD |
| `src/lib/think-pipeline.ts` | Orchestrates the 4-stage pipeline |
| `src/lib/think-explorers.ts` | 4 parallel explorer agents (semantic, people, temporal, graph) |
| `src/lib/think-synthesizer.ts` | Opus synthesis call + JSON parsing |
| `src/app/api/ai/think-sweep/start/route.ts` | Batch sweep endpoint — stages 1-3 + batch submission |
| `src/app/api/ai/think-sweep/status/route.ts` | Batch status polling endpoint |
| `src/app/api/ai/think-sweep/process/route.ts` | Batch result processing endpoint |
| `prisma/migrations/20260410000000_add_think_triage/migration.sql` | NoteThinkTriage table |
| `prisma/migrations/20260410100000_add_think_batch/migration.sql` | ThinkBatchItem table |
| `tests/lib/think-triage.test.ts` | Triage CRUD tests |

### Modified files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add NoteThinkTriage and ThinkBatchItem models |
| `src/app/api/ai/think/route.ts` | Refactor to use pipeline |
| `src/app/api/ai/think-sweep/pending/route.ts` | Add triage filter |
| `src/components/UserProfilePage.tsx` | Add batch mode UI |
| `tests/edge-cases/cascade-deletes.test.ts` | Add triage + batch cleanup |

---

### Task 1: Add NoteThinkTriage Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260410000000_add_think_triage/migration.sql`

- [ ] **Step 1: Add NoteThinkTriage model to schema.prisma**

Add after the `UserInsight` model at the end of `prisma/schema.prisma`:

```prisma
model NoteThinkTriage {
  id        String   @id @default(uuid())
  noteId    String   @unique
  worthy    Boolean
  reason    String   @default("")
  triagedAt DateTime @default(now())

  @@index([noteId])
}
```

- [ ] **Step 2: Create the migration SQL manually**

Create `prisma/migrations/20260410000000_add_think_triage/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "NoteThinkTriage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "worthy" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "triagedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "NoteThinkTriage_noteId_key" ON "NoteThinkTriage"("noteId");

-- CreateIndex
CREATE INDEX "NoteThinkTriage_noteId_idx" ON "NoteThinkTriage"("noteId");
```

- [ ] **Step 3: Run prisma generate and migrate deploy**

Run: `npx prisma generate && npx prisma migrate deploy`
Expected: Both succeed, `dev.db` updated with new table.

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `npm test`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260410000000_add_think_triage/
git commit -m "feat: add NoteThinkTriage schema and migration"
```

---

### Task 2: Implement think-triage.ts

**Files:**
- Create: `src/lib/think-triage.ts`
- Test: `tests/lib/think-triage.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/think-triage.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  getTriageForNote,
  upsertTriage,
  deleteTriageForNote,
  getTriagesForNotes,
} from "@/lib/think-triage";
import { createNote } from "@/lib/notes";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.noteThinkTriage.deleteMany();
  await prisma.note.deleteMany();
});

describe("upsertTriage", () => {
  it("creates a triage result for a note", async () => {
    const note = await createNote({ title: "Test" });
    const triage = await upsertTriage(note.id, true, "Has reflective content");
    expect(triage.noteId).toBe(note.id);
    expect(triage.worthy).toBe(true);
    expect(triage.reason).toBe("Has reflective content");
    expect(triage.triagedAt).toBeInstanceOf(Date);
  });

  it("updates existing triage on re-triage", async () => {
    const note = await createNote({ title: "Test" });
    await upsertTriage(note.id, false, "Too short");
    const updated = await upsertTriage(note.id, true, "Content was added");
    expect(updated.worthy).toBe(true);
    expect(updated.reason).toBe("Content was added");
  });
});

describe("getTriageForNote", () => {
  it("returns null when no triage exists", async () => {
    const result = await getTriageForNote("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns the triage result", async () => {
    const note = await createNote({ title: "Test" });
    await upsertTriage(note.id, true, "Worthy");
    const result = await getTriageForNote(note.id);
    expect(result).not.toBeNull();
    expect(result!.worthy).toBe(true);
  });
});

describe("getTriagesForNotes", () => {
  it("returns triages for multiple notes", async () => {
    const note1 = await createNote({ title: "A" });
    const note2 = await createNote({ title: "B" });
    await upsertTriage(note1.id, true, "Worthy");
    await upsertTriage(note2.id, false, "Stub");
    const results = await getTriagesForNotes([note1.id, note2.id]);
    expect(results.size).toBe(2);
    expect(results.get(note1.id)!.worthy).toBe(true);
    expect(results.get(note2.id)!.worthy).toBe(false);
  });
});

describe("deleteTriageForNote", () => {
  it("removes the triage result", async () => {
    const note = await createNote({ title: "Test" });
    await upsertTriage(note.id, true, "Test");
    await deleteTriageForNote(note.id);
    const result = await getTriageForNote(note.id);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/lib/think-triage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement think-triage.ts**

Create `src/lib/think-triage.ts`:

```typescript
import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

export interface ThinkTriage {
  id: string;
  noteId: string;
  worthy: boolean;
  reason: string;
  triagedAt: Date;
}

export async function upsertTriage(
  noteId: string,
  worthy: boolean,
  reason: string,
  db: PrismaClient = defaultPrisma
): Promise<ThinkTriage> {
  const existing = await db.noteThinkTriage.findUnique({ where: { noteId } });
  if (existing) {
    const raw = await db.noteThinkTriage.update({
      where: { noteId },
      data: { worthy, reason, triagedAt: new Date().toISOString() },
    });
    return raw as ThinkTriage;
  }
  const raw = await db.noteThinkTriage.create({
    data: { noteId, worthy, reason },
  });
  return raw as ThinkTriage;
}

export async function getTriageForNote(
  noteId: string,
  db: PrismaClient = defaultPrisma
): Promise<ThinkTriage | null> {
  const raw = await db.noteThinkTriage.findUnique({ where: { noteId } });
  return raw as ThinkTriage | null;
}

export async function getTriagesForNotes(
  noteIds: string[],
  db: PrismaClient = defaultPrisma
): Promise<Map<string, ThinkTriage>> {
  if (noteIds.length === 0) return new Map();
  const rows = await db.noteThinkTriage.findMany({
    where: { noteId: { in: noteIds } },
  });
  const map = new Map<string, ThinkTriage>();
  for (const row of rows) {
    map.set(row.noteId, row as ThinkTriage);
  }
  return map;
}

export async function deleteTriageForNote(
  noteId: string,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await db.noteThinkTriage.deleteMany({ where: { noteId } });
}

const TRIAGE_PROMPT = `You are evaluating whether a note has enough substance for deep analysis that finds connections to other notes in a knowledge base.

Return valid JSON (no markdown fences): {"worthy": true/false, "reason": "brief explanation"}

Answer NO only for notes that are truly trivial with no analytical value:
- Bare grocery/shopping lists with no context
- Empty stubs with just a title and no content
- Template boilerplate with no user content

Answer YES for everything else, including:
- To-do lists (reveal how the user organizes work)
- Logistics/planning notes (reveal decision-making patterns)
- Short notes with opinions, reflections, or questions
- Notes about people, events, or decisions
- Any note where the user expresses a perspective, feeling, or intention`;

export async function triageNote(
  title: string,
  content: string
): Promise<{ worthy: boolean; reason: string }> {
  const anthropic = new Anthropic();
  const truncated = content.slice(0, 2000);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Evaluate this note:\n\nTitle: ${title}\n\n${truncated}`,
      },
    ],
    system: TRIAGE_PROMPT,
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  text = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    const result = JSON.parse(text);
    return {
      worthy: Boolean(result.worthy),
      reason: String(result.reason ?? ""),
    };
  } catch {
    // If Haiku fails to return JSON, default to worthy (permissive)
    return { worthy: true, reason: "Triage parse failed — defaulting to worthy" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/think-triage.test.ts`
Expected: All pass (CRUD tests don't hit the AI — only `triageNote` does, which is not tested here).

- [ ] **Step 5: Commit**

```bash
git add src/lib/think-triage.ts tests/lib/think-triage.test.ts
git commit -m "feat: add think triage CRUD and Haiku triage call"
```

---

### Task 3: Implement think-explorers.ts

**Files:**
- Create: `src/lib/think-explorers.ts`

- [ ] **Step 1: Define the ExplorationPlan and ExplorerResult types**

These types are shared between the planner, explorers, and synthesizer.

Create `src/lib/think-explorers.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { readOnlyVaultTools, executeTool } from "@/lib/ai-tools";
import type { EmbeddingCache } from "@/lib/embeddings";
import type { PrismaClient } from "@prisma/client";

export interface ExplorationPlan {
  semanticQueries: string[];
  people: string[];
  timePeriods: Array<{ start: string; end: string; why: string }>;
  wikiLinks: string[];
  questions: string[];
}

export interface ExplorerResult {
  explorer: "semantic" | "people" | "temporal" | "graph";
  summary: string;
}

const MAX_EXPLORER_ROUNDS = 4;

async function runExplorer(
  explorerType: "semantic" | "people" | "temporal" | "graph",
  systemPrompt: string,
  userMessage: string,
  meta: { sourceNoteId: string; embeddingCache?: EmbeddingCache; cookie?: string },
  db: PrismaClient
): Promise<ExplorerResult> {
  const anthropic = new Anthropic();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system: systemPrompt,
    tools: readOnlyVaultTools,
    messages,
  });

  let rounds = 0;
  while (response.stop_reason === "tool_use" && rounds < MAX_EXPLORER_ROUNDS) {
    rounds++;
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolBlocks.map(async (block) => {
        try {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            meta,
            db
          );
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: result,
          };
        } catch (err) {
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: `Error: ${err instanceof Error ? err.message : "Tool execution failed"}`,
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: systemPrompt,
      tools: readOnlyVaultTools,
      messages,
    });
  }

  // If still in tool_use after max rounds, force final response
  if (response.stop_reason === "tool_use") {
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });
    const toolBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = toolBlocks.map((block) => ({
      type: "tool_result" as const,
      tool_use_id: block.id,
      content: "Tool limit reached. Return your summary now.",
    }));
    messages.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages,
    });
  }

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  return { explorer: explorerType, summary: text.trim() || "No findings." };
}

function buildSemanticPrompt(noteTitle: string, noteContent: string, plan: ExplorationPlan): { system: string; user: string } {
  const queryHints = plan.semanticQueries.length > 0
    ? `\n\nSuggested search angles: ${plan.semanticQueries.join("; ")}`
    : "";

  return {
    system: `You are a semantic explorer for a personal knowledge base. Your job is to find notes related by MEANING to the current note.

Use semantic_search with different query angles — themes, emotions, underlying tensions. Read the top 3-5 most relevant notes in full.

Return a structured summary (not raw tool output):
- For each related note: title, [[wiki-link format]], WHY it's relevant, key quotes
- Potential connection types: contradiction, evolution, recurring pattern, unresolved tension, causal chain
- Keep your summary under 800 words.`,
    user: `Find notes semantically related to this note:\n\nTitle: ${noteTitle}\n\n${noteContent}${queryHints}`,
  };
}

function buildPeoplePrompt(noteTitle: string, noteContent: string, plan: ExplorationPlan): { system: string; user: string } {
  return {
    system: `You are a people explorer for a personal knowledge base. Your job is to investigate people mentioned in or related to the current note.

Use list_people to see who's tracked. Use search_by_person to find notes mentioning them. Read relevant notes to understand relationship patterns.

Return a structured summary (not raw tool output):
- For each relevant person: name, how they appear across notes, relationship patterns, behavioral observations
- Highlight any changes in how the user relates to or perceives this person over time
- Keep your summary under 800 words.`,
    user: `Investigate people related to this note:\n\nTitle: ${noteTitle}\n\n${noteContent}\n\nPeople to investigate: ${plan.people.length > 0 ? plan.people.join(", ") : "Identify from context"}`,
  };
}

function buildTemporalPrompt(noteTitle: string, noteContent: string, plan: ExplorationPlan): { system: string; user: string } {
  const timeContext = plan.timePeriods.length > 0
    ? plan.timePeriods.map((t) => `${t.start} to ${t.end}: ${t.why}`).join("\n")
    : "Identify relevant time periods from the note's context.";

  return {
    system: `You are a temporal explorer for a personal knowledge base. Your job is to find how thinking on this note's topics has evolved over time.

Use search_by_timeframe to find notes from relevant periods. Read them to understand shifts in perspective.

Return a structured summary (not raw tool output):
- Timeline of related notes with dates
- Identified shifts in perspective or approach
- Before/after patterns — how the user's stance changed
- Keep your summary under 800 words.`,
    user: `Find the temporal context for this note:\n\nTitle: ${noteTitle}\n\n${noteContent}\n\nTime periods to investigate:\n${timeContext}`,
  };
}

function buildGraphPrompt(noteTitle: string, noteContent: string, noteId: string, plan: ExplorationPlan): { system: string; user: string } {
  return {
    system: `You are a graph explorer for a personal knowledge base. Your job is to follow [[wiki-links]] and map the note's neighborhood.

Use get_note_graph to follow links. Read linked notes that look promising. Use read_note to go deeper on surprising connections.

Return a structured summary (not raw tool output):
- Neighborhood map: which notes are linked and how
- Thematically surprising linked notes (linked but about something unexpected)
- Clusters of tightly-linked notes
- Keep your summary under 800 words.`,
    user: `Map the link neighborhood of this note:\n\nTitle: ${noteTitle}\nNote ID: ${noteId}\n\n${noteContent}\n\nWiki-links to investigate: ${plan.wikiLinks.length > 0 ? plan.wikiLinks.join(", ") : "Follow links found in content"}`,
  };
}

export async function runAllExplorers(
  noteId: string,
  noteTitle: string,
  noteContent: string,
  plan: ExplorationPlan,
  meta: { embeddingCache?: EmbeddingCache; cookie?: string },
  db: PrismaClient
): Promise<ExplorerResult[]> {
  const sharedMeta = { sourceNoteId: noteId, ...meta };

  const semanticPrompt = buildSemanticPrompt(noteTitle, noteContent, plan);
  const peoplePrompt = buildPeoplePrompt(noteTitle, noteContent, plan);
  const temporalPrompt = buildTemporalPrompt(noteTitle, noteContent, plan);
  const graphPrompt = buildGraphPrompt(noteTitle, noteContent, noteId, plan);

  const results = await Promise.all([
    runExplorer("semantic", semanticPrompt.system, semanticPrompt.user, sharedMeta, db)
      .catch((err) => {
        console.error("[think:semantic-explorer] failed:", err);
        return { explorer: "semantic" as const, summary: "Explorer failed." };
      }),
    runExplorer("people", peoplePrompt.system, peoplePrompt.user, sharedMeta, db)
      .catch((err) => {
        console.error("[think:people-explorer] failed:", err);
        return { explorer: "people" as const, summary: "Explorer failed." };
      }),
    runExplorer("temporal", temporalPrompt.system, temporalPrompt.user, sharedMeta, db)
      .catch((err) => {
        console.error("[think:temporal-explorer] failed:", err);
        return { explorer: "temporal" as const, summary: "Explorer failed." };
      }),
    runExplorer("graph", graphPrompt.system, graphPrompt.user, sharedMeta, db)
      .catch((err) => {
        console.error("[think:graph-explorer] failed:", err);
        return { explorer: "graph" as const, summary: "Explorer failed." };
      }),
  ]);

  return results;
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors related to `think-explorers.ts`. (AI-related types should resolve against the existing `@anthropic-ai/sdk` installation.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/think-explorers.ts
git commit -m "feat: add 4 parallel think explorer agents"
```

---

### Task 4: Implement think-synthesizer.ts

**Files:**
- Create: `src/lib/think-synthesizer.ts`

- [ ] **Step 1: Create the Opus synthesizer**

Create `src/lib/think-synthesizer.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ExplorerResult, ExplorationPlan } from "@/lib/think-explorers";

export interface ThinkResult {
  connections: string;
  insights: Array<{ category: string; content: string; evidence?: string }>;
  peopleInsights?: Array<{ name: string; observation: string }>;
}

export function buildSynthesisMessages(
  noteTitle: string,
  noteContent: string,
  plan: ExplorationPlan,
  explorerResults: ExplorerResult[],
  knownPeople: string[]
): { system: string; messages: Anthropic.MessageParam[] } {
  const explorerSummaries = explorerResults
    .map((r) => `### ${r.explorer.charAt(0).toUpperCase() + r.explorer.slice(1)} Explorer\n${r.summary}`)
    .join("\n\n");

  const system = `You are a deep reasoning engine for a personal knowledge base called Obsid. You have received exploration results from four specialized agents that searched the vault on your behalf. Your job is to synthesize their findings into meaningful connections.

## Current note
Title: ${noteTitle}
Content:
${noteContent}

## Exploration plan
${JSON.stringify(plan, null, 2)}

## Explorer findings
${explorerSummaries}

## Known people
${knownPeople.length > 0 ? knownPeople.join(", ") : "None tracked yet"}

## Your task
Analyze the explorer findings deeply. Do NOT just summarize what the explorers found — look for patterns, contradictions, and connections BETWEEN their findings that no single explorer could see.

## Connection types to find
1. **Contradictions**: The user said X here but Y in another note
2. **Evolution**: Their thinking on a topic shifted over time
3. **Recurring patterns**: The same dynamic or tension appearing across notes
4. **Unresolved tensions**: Questions or conflicts they keep circling without resolving
5. **Causal chains**: A decision in one note led to an outcome in another

## Output format
Return valid JSON (no markdown fences):
{
  "connections": "Markdown text with [[wiki-links]] explaining each connection and WHY it matters. Use bullet points. Be specific — reference note content, not just titles.",
  "insights": [{"category": "behavior|self-reflection|expertise|thinking-pattern", "content": "insight text", "evidence": "quote from note"}],
  "peopleInsights": [{"name": "Person Name", "observation": "what you discovered about this person across notes"}]
}

If the explorers found nothing meaningful, return: {"connections": "", "insights": [], "peopleInsights": []}

The connections text should be specific. Not "these notes are related" but "in [[Note X]] you described feeling Y, and here you're experiencing the same tension from a different angle."

peopleInsights should use the person's primary name as listed in the known people list.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: "Synthesize the explorer findings into deep connections. Look for what no single explorer could see on its own.",
    },
  ];

  return { system, messages };
}

export async function synthesize(
  noteTitle: string,
  noteContent: string,
  plan: ExplorationPlan,
  explorerResults: ExplorerResult[],
  knownPeople: string[]
): Promise<ThinkResult> {
  const anthropic = new Anthropic();
  const { system, messages } = buildSynthesisMessages(
    noteTitle,
    noteContent,
    plan,
    explorerResults,
    knownPeople
  );

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4000,
    system,
    messages,
    thinking: {
      type: "enabled",
      budget_tokens: 10000,
    },
  });

  let resultText = "";
  for (const block of response.content) {
    if (block.type === "text") resultText += block.text;
  }

  // Strip markdown fences if present
  resultText = resultText
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // Extract JSON — Opus sometimes writes preamble
  const jsonMatch = resultText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    resultText = jsonMatch[0];
  }

  if (!resultText) {
    return { connections: "", insights: [], peopleInsights: [] };
  }

  try {
    return JSON.parse(resultText) as ThinkResult;
  } catch {
    console.warn("[think:synthesizer] Non-JSON response:", resultText.slice(0, 200));
    return { connections: "", insights: [], peopleInsights: [] };
  }
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/think-synthesizer.ts
git commit -m "feat: add Opus think synthesizer"
```

---

### Task 5: Implement think-pipeline.ts

**Files:**
- Create: `src/lib/think-pipeline.ts`

- [ ] **Step 1: Create the pipeline orchestrator**

Create `src/lib/think-pipeline.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { getNote, conditionalUpdateNote, updateNote } from "@/lib/notes";
import { getPersonByAlias, addNotePerson } from "@/lib/people";
import { listPeople } from "@/lib/people";
import { loadEmbeddingCache, embedNote } from "@/lib/embeddings";
import { createUserInsights } from "@/lib/user-insights";
import { extractInlineTags } from "@/lib/tags";
import { triageNote, upsertTriage, getTriageForNote } from "@/lib/think-triage";
import { runAllExplorers, type ExplorationPlan } from "@/lib/think-explorers";
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
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/think-pipeline.ts
git commit -m "feat: add think pipeline orchestrator"
```

---

### Task 6: Refactor think/route.ts to Use Pipeline

**Files:**
- Modify: `src/app/api/ai/think/route.ts`

- [ ] **Step 1: Replace the entire route with pipeline call**

Replace the full contents of `src/app/api/ai/think/route.ts` with:

```typescript
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
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/think/route.ts
git commit -m "refactor: think route uses multi-agent pipeline"
```

---

### Task 7: Update think-sweep/pending to Filter by Triage

**Files:**
- Modify: `src/app/api/ai/think-sweep/pending/route.ts`

- [ ] **Step 1: Add triage filtering to the pending endpoint**

Replace the full contents of `src/app/api/ai/think-sweep/pending/route.ts` with:

```typescript
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
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/think-sweep/pending/route.ts
git commit -m "feat: filter think-sweep pending by triage results"
```

---

### Task 8: Add ThinkBatchItem Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260410100000_add_think_batch/migration.sql`

- [ ] **Step 1: Add ThinkBatchItem model to schema.prisma**

Add after the `NoteThinkTriage` model:

```prisma
model ThinkBatchItem {
  id               String   @id @default(uuid())
  batchId          String
  noteId           String
  customId         String
  noteTitle        String   @default("")
  noteContent      String   @default("")
  explorationPlan  String   @default("{}")
  explorerResults  String   @default("[]")
  knownPeople      String   @default("[]")
  status           String   @default("pending")
  createdAt        DateTime @default(now())

  @@index([batchId])
  @@index([noteId])
}
```

- [ ] **Step 2: Create the migration SQL**

Create `prisma/migrations/20260410100000_add_think_batch/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "ThinkBatchItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "customId" TEXT NOT NULL,
    "noteTitle" TEXT NOT NULL DEFAULT '',
    "noteContent" TEXT NOT NULL DEFAULT '',
    "explorationPlan" TEXT NOT NULL DEFAULT '{}',
    "explorerResults" TEXT NOT NULL DEFAULT '[]',
    "knownPeople" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ThinkBatchItem_batchId_idx" ON "ThinkBatchItem"("batchId");

-- CreateIndex
CREATE INDEX "ThinkBatchItem_noteId_idx" ON "ThinkBatchItem"("noteId");
```

- [ ] **Step 3: Run prisma generate and migrate deploy**

Run: `npx prisma generate && npx prisma migrate deploy`
Expected: Both succeed.

- [ ] **Step 4: Run existing tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260410100000_add_think_batch/
git commit -m "feat: add ThinkBatchItem schema and migration"
```

---

### Task 9: Add Batch Sweep Endpoints

**Files:**
- Create: `src/app/api/ai/think-sweep/start/route.ts`
- Create: `src/app/api/ai/think-sweep/status/route.ts`
- Create: `src/app/api/ai/think-sweep/process/route.ts`

- [ ] **Step 1: Create the start endpoint**

Create `src/app/api/ai/think-sweep/start/route.ts`:

```typescript
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
    betas: [],
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
```

- [ ] **Step 2: Create the status endpoint**

Create `src/app/api/ai/think-sweep/status/route.ts`:

```typescript
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get("batchId");
  if (!batchId) {
    return Response.json({ error: "batchId is required" }, { status: 400 });
  }

  const anthropic = new Anthropic();

  try {
    const batch = await anthropic.beta.messages.batches.retrieve(batchId);
    return Response.json({
      batchId: batch.id,
      status: batch.processing_status,
      counts: batch.request_counts,
    });
  } catch (err) {
    console.error("[think-sweep:status] Failed to retrieve batch:", err);
    return Response.json({ error: "Failed to retrieve batch status" }, { status: 502 });
  }
}
```

- [ ] **Step 3: Create the process endpoint**

Create `src/app/api/ai/think-sweep/process/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { processThinkResult } from "@/lib/think-pipeline";
import type { ThinkResult } from "@/lib/think-synthesizer";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const cookie = request.headers.get("cookie") ?? "";
  const { batchId } = await request.json();

  if (!batchId) {
    return Response.json({ error: "batchId is required" }, { status: 400 });
  }

  const anthropic = new Anthropic();

  // Verify batch is complete
  const batch = await anthropic.beta.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") {
    return Response.json({ error: "Batch is not yet complete" }, { status: 400 });
  }

  // Get stored intermediate data
  const items = await db.thinkBatchItem.findMany({
    where: { batchId },
  });

  if (items.length === 0) {
    return Response.json({ error: "No batch items found" }, { status: 404 });
  }

  // Process batch results
  let processed = 0;
  let failed = 0;

  for await (const result of anthropic.beta.messages.batches.results(batchId)) {
    const item = items.find((i) => i.customId === result.custom_id);
    if (!item) continue;

    if (result.result.type !== "succeeded") {
      console.error(`[think-sweep:process] Batch item ${result.custom_id} failed:`, result.result.type);
      failed++;
      continue;
    }

    const message = result.result.message;
    let resultText = "";
    for (const block of message.content) {
      if (block.type === "text") resultText += block.text;
    }

    resultText = resultText
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) resultText = jsonMatch[0];

    let thinkResult: ThinkResult;
    try {
      thinkResult = JSON.parse(resultText);
    } catch {
      console.warn(`[think-sweep:process] Non-JSON for ${result.custom_id}:`, resultText.slice(0, 200));
      failed++;
      continue;
    }

    try {
      await processThinkResult(item.noteId, thinkResult, db, cookie);
      processed++;
    } catch (err) {
      console.error(`[think-sweep:process] Failed to process ${result.custom_id}:`, err);
      failed++;
    }
  }

  // Clean up batch items
  await db.thinkBatchItem.deleteMany({ where: { batchId } });

  return Response.json({ processed, failed, total: items.length });
}
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai/think-sweep/start/route.ts src/app/api/ai/think-sweep/status/route.ts src/app/api/ai/think-sweep/process/route.ts
git commit -m "feat: add batch sweep endpoints (start, status, process)"
```

---

### Task 10: Update UserProfilePage for Batch Mode

**Files:**
- Modify: `src/components/UserProfilePage.tsx`

- [ ] **Step 1: Add batch sweep state and UI**

Add `"batch-submitted"` and `"batch-checking"` to `SweepState`:

```typescript
type SweepState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "thinking"; current: number; total: number; noteTitle: string }
  | { status: "done"; processed: number }
  | { status: "error"; message: string }
  | { status: "batch-submitted"; batchId: string; total: number }
  | { status: "batch-checking"; batchId: string }
  | { status: "batch-done"; processed: number; failed: number };
```

- [ ] **Step 2: Add the batch sweep handler**

Add after the `runSweep` callback:

```typescript
const runBatchSweep = useCallback(async () => {
  setSweep({ status: "loading" });

  try {
    const res = await fetch("/api/ai/think-sweep/start", { method: "POST" });
    if (!res.ok) {
      setSweep({ status: "error", message: "Failed to start batch sweep" });
      return;
    }
    const data = await res.json();
    if (!data.batchId) {
      setSweep({ status: "done", processed: 0 });
      return;
    }
    setSweep({ status: "batch-submitted", batchId: data.batchId, total: data.total });
  } catch {
    setSweep({ status: "error", message: "Failed to start batch sweep" });
  }
}, []);

const checkBatchStatus = useCallback(async (batchId: string) => {
  setSweep({ status: "batch-checking", batchId });

  try {
    const statusRes = await fetch(`/api/ai/think-sweep/status?batchId=${batchId}`);
    if (!statusRes.ok) {
      setSweep({ status: "error", message: "Failed to check batch status" });
      return;
    }
    const statusData = await statusRes.json();

    if (statusData.status !== "ended") {
      setSweep({ status: "batch-submitted", batchId, total: statusData.counts?.processing ?? 0 });
      return;
    }

    // Batch complete — process results
    const processRes = await fetch("/api/ai/think-sweep/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId }),
    });

    if (!processRes.ok) {
      setSweep({ status: "error", message: "Failed to process batch results" });
      return;
    }

    const processData = await processRes.json();
    setSweep({ status: "batch-done", processed: processData.processed, failed: processData.failed });
    fetchData();
  } catch {
    setSweep({ status: "error", message: "Failed to check batch status" });
  }
}, [fetchData]);
```

- [ ] **Step 3: Update the sweep button UI**

Replace the idle state button with two options, and add UI for batch states. Replace the `{sweep.status === "idle" && (` block:

```tsx
{sweep.status === "idle" && (
  <div className="flex gap-2">
    <button
      onClick={runSweep}
      className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
    >
      Think now
    </button>
    <button
      onClick={runBatchSweep}
      className="text-xs px-3 py-1.5 rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
    >
      Think later (batch)
    </button>
  </div>
)}
```

Add after the `sweep.status === "error"` block, before `</div>`:

```tsx
{sweep.status === "batch-submitted" && (
  <div className="flex items-center gap-2">
    <p className="text-xs text-zinc-500">
      Batch submitted &mdash; {sweep.total} note{sweep.total !== 1 ? "s" : ""} queued
    </p>
    <button
      onClick={() => checkBatchStatus(sweep.batchId)}
      className="text-xs text-indigo-500 hover:text-indigo-700"
    >
      Check status
    </button>
  </div>
)}
{sweep.status === "batch-checking" && (
  <p className="text-xs text-zinc-400">Checking batch status...</p>
)}
{sweep.status === "batch-done" && (
  <div className="flex items-center gap-2">
    <p className="text-xs text-zinc-500">
      Batch complete &mdash; {sweep.processed} processed{sweep.failed > 0 ? `, ${sweep.failed} failed` : ""}
    </p>
    <button
      onClick={() => setSweep({ status: "idle" })}
      className="text-xs text-indigo-500 hover:text-indigo-700"
    >
      Dismiss
    </button>
  </div>
)}
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/UserProfilePage.tsx
git commit -m "feat: add batch think mode to user profile page"
```

---

### Task 11: Update Cascade Deletes

**Files:**
- Modify: `tests/edge-cases/cascade-deletes.test.ts`

- [ ] **Step 1: Check current cascade delete test**

Read `tests/edge-cases/cascade-deletes.test.ts` to understand the existing pattern. The delete order in `DELETE /api/notes/[id]` must include `noteThinkTriage` and `thinkBatchItem` cleanup.

- [ ] **Step 2: Update the delete route**

In `src/app/api/notes/[id]/route.ts`, add before the note deletion:

```typescript
// Clean up think triage
await db.noteThinkTriage.deleteMany({ where: { noteId: id } });
// Clean up batch items
await db.thinkBatchItem.deleteMany({ where: { noteId: id } });
```

- [ ] **Step 3: Add triage cleanup to test beforeEach blocks**

In `tests/lib/think-triage.test.ts` and any other test files with `beforeEach` cleanup, add:

```typescript
await prisma.noteThinkTriage.deleteMany();
await prisma.thinkBatchItem.deleteMany();
```

Add these before existing cleanup lines (before `note` deletion to respect ordering).

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: cascade delete think triage and batch items on note deletion"
```

---

### Task 12: Manual Integration Test

This task verifies the full pipeline works end-to-end. It requires `ANTHROPIC_API_KEY` to be set.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Server starts on localhost:3000.

- [ ] **Step 2: Create a test note with reflective content**

Open the app in a browser. Create a note with enough substance for analysis — something with opinions, mentions of people, or references to other notes via `[[wiki-links]]`.

- [ ] **Step 3: Test live think on the note**

Open browser dev tools (Network tab). Navigate to `/me` and click "Think now." Verify:
- The progress indicator shows
- Server logs show the 4-stage pipeline: `[think] Planning exploration...`, `[think] Running 4 explorers...`, `[think] Synthesizing with Opus...`
- The note gets a `**Connections**` section appended
- Insights appear on the `/me` page

- [ ] **Step 4: Test batch mode**

Click "Think later (batch)." Verify:
- The UI shows "Batch submitted — N notes queued"
- The "Check status" button appears
- Clicking "Check status" either shows still processing or triggers result processing

- [ ] **Step 5: Verify triage filtering**

Create a note that's just "eggs, milk, bread" with title "Groceries." Run a sweep. Verify this note is either skipped by triage or filtered from the pending list.

- [ ] **Step 6: Commit any fixes**

If any issues were found and fixed during testing, commit them:

```bash
git add -A
git commit -m "fix: integration test fixes for multi-agent think pipeline"
```
