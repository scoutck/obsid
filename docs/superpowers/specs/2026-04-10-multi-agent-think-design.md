# Multi-Agent Think Pipeline

## Overview

Redesign the think system from a single-agent Sonnet loop into a 4-stage multi-agent pipeline that separates exploration from synthesis. The primary goal is better outcomes — deeper, more specific connections and stronger synthesis. The secondary goal is cost efficiency through cheap exploration agents and optional batch processing.

## Current System

Single Sonnet call with extended thinking, up to 8 tool rounds with read-only vault tools. One model does everything: explores the vault, reasons about connections, and synthesizes the final output. This produces shallow connections ("these notes are related") and weak synthesis — the model spreads its attention across exploration and reasoning in the same bloated context.

## Pipeline Architecture

```
Note --> [1. Triage] --> [2. Plan] --> [3. Explore] --> [4. Synthesize] --> Output
           Haiku          Sonnet       Haiku x4          Opus
           ~$0.001        ~$0.01       ~$0.04            ~$0.10-0.30
```

Total cost per note: ~$0.15-0.35 (vs ~$0.05-0.15 today).
For batch mode, Opus stage is 50% off via Batch API: ~$0.10-0.20 per note.

## Stage 1: Triage (Haiku)

A single Haiku call that determines whether a note has enough substance for deep analysis.

**Input:** Note title + content (truncated to ~2000 chars).

**Prompt direction:** Very permissive filter. Only reject notes that are truly trivial with no reflective, behavioral, or contextual signal. To-do lists, logistics notes, and packing lists pass — they reveal how the user works. Only reject things like bare grocery lists, empty stubs, or notes with just a title.

**Output:** `{worthy: boolean, reason: string}`

**On no:** Pipeline stops. Triage result is stored so the note isn't re-evaluated until it's edited.

**On yes:** Pipeline continues to Stage 2.

**Live mode bypass:** When a user explicitly triggers think on a specific note (live mode), triage is skipped — they chose to think about it. Triage only gates the sweep.

### Triage Tracking

New `NoteThinkTriage` table stores triage results:

```
NoteThinkTriage
  id        String   @id @default(uuid())
  noteId    String
  worthy    Boolean
  reason    String
  triagedAt DateTime @default(now())
```

Notes are re-triaged when `note.updatedAt > triage.triagedAt`. This avoids re-evaluating unchanged notes on every sweep. The `reason` field aids debugging.

## Stage 2: Plan (Sonnet)

A single Sonnet call (`claude-sonnet-4-6`) that reads the note and produces a structured exploration plan. No tools, no extended thinking — just a focused prompt-in, JSON-out call.

**Input:** Note title + full content.

**Output:** A structured plan directing the explorers:
- Key themes and underlying tensions to search for semantically
- People mentioned or implied to investigate
- Time periods relevant to the note's context
- Wiki-links to follow and why
- Specific questions to answer (e.g., "has the user's stance on X changed?")

This replaces the current approach where Sonnet improvises its search strategy mid-loop. The plan ensures explorers search with intention rather than groping blindly.

## Stage 3: Explore (Haiku x4, Parallel)

Four parallel Haiku agents, each with a focused mandate. Each gets read-only vault tools and up to 4 tool rounds. Each returns a structured summary of findings, not raw tool output.

### Semantic Explorer

- Runs 2-3 semantic searches with different query angles (themes, emotions, underlying tensions from the plan)
- Reads the top 3-5 most relevant notes in full
- Returns: list of related notes with why they're relevant, key quotes, potential connection types

### People Explorer

- Lists known people, identifies who's mentioned in the note
- Searches for other notes mentioning the same people
- Returns: per-person summary of how they appear across notes, relationship patterns, behavioral observations

### Temporal Explorer

- Searches for notes from the same time period and adjacent periods
- Looks for evolution — how thinking on the same topic changed over weeks/months
- Returns: timeline of related notes, identified shifts in perspective, before/after patterns

### Graph Explorer

- Follows wiki-links from the note (depth 2-3)
- Reads linked notes and their links
- Returns: neighborhood map with connection strength, thematically surprising linked notes, clusters

### Explorer Design Principles

- Each explorer receives: the original note (title + content) and the relevant portion of the exploration plan
- Explorers don't see each other's results — they explore independently
- Each explorer must distill findings into ~500-1000 tokens — no raw tool dumps
- Explorers share the pre-loaded embedding cache for semantic search efficiency
- Tool errors are non-fatal (same pattern as current think)

## Stage 4: Synthesize (Opus)

A single Opus call with no tools. Pure reasoning and synthesis.

**Input:**
- Original note (title + full content)
- Exploration plan from Stage 2
- All four explorer summaries (~500-1000 tokens each)
- Known people list (for alias resolution in people insights)

**Reasoning focus — five connection types:**
1. **Contradictions** — the user said X here but Y elsewhere
2. **Evolution** — thinking on a topic shifted over time
3. **Recurring patterns** — same tension or dynamic across notes
4. **Unresolved tensions** — questions or conflicts circled without resolution
5. **Causal chains** — a decision in one note led to an outcome in another

**Output:** Same `ThinkResult` shape as today:
```typescript
{
  connections: string;     // Markdown with [[wiki-links]]
  insights: Array<{category, content, evidence}>;
  peopleInsights: Array<{name, observation}>;
}
```

**Extended thinking:** Enabled with ~10k budget tokens for deeper reasoning.

**Why no tools:** Explorers already gathered everything. Keeping Opus tool-free means a single API call, predictable cost, and — critically — it enables batch processing. Tool-use calls cannot be batched.

## Live vs. Batch Mode

### Live Mode (`mode: "live"`)

All 4 stages run synchronously. The client waits for the result. Used for single-note think or when the user wants immediate results.

**UX:** Same as today — progress indicator while processing.

### Batch Mode (`mode: "batch"`)

Stages 1-3 run live (cheap, fast). Stage 4 is submitted to the Anthropic Batch API at 50% reduced cost.

**Intermediate storage:** Stages 1-3 results (exploration plan + explorer summaries) are stored temporarily so they survive until the batch completes. Options: a `ThinkBatchItem` table keyed by batch ID and note ID, or a JSON file on disk. The table approach is cleaner for multi-user — each row holds the note ID, exploration plan, serialized explorer summaries, and batch request custom_id for result matching.

**Flow:**
1. Client calls `POST /api/ai/think-sweep/start`
2. Server runs triage → plan → explore for all pending notes, stores intermediate results
3. Server submits all Opus synthesis calls as one batch
4. Returns a batch ID to the client
5. Client polls `GET /api/ai/think-sweep/status?batchId=X`
6. When complete, client calls `POST /api/ai/think-sweep/process?batchId=X`
7. Server processes all results (append connections, store insights, route people insights)

**UX:** User clicks "Think later (batch)" on `/me` page. Shows "Batch submitted — 15 notes queued." Can check back later for status.

**Cost savings:** Opus output at $37.50/M instead of $75/M. For a 20-note sweep, saves ~$1-3.

## API Structure

### Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ai/think` | POST | Orchestrates the full pipeline. Params: `{noteId, mode: "live" \| "batch"}` |
| `/api/ai/think-sweep/start` | POST | Batch sweep — runs stages 1-3, submits Opus batch |
| `/api/ai/think-sweep/status` | GET | Polls batch completion. Params: `?batchId=X` |
| `/api/ai/think-sweep/process` | POST | Processes completed batch results |
| `/api/ai/think-sweep/pending` | GET | Existing — unchanged, adds triage filter |

### New Files

| File | Purpose |
|------|---------|
| `src/lib/think-triage.ts` | Haiku triage call + NoteThinkTriage CRUD |
| `src/lib/think-pipeline.ts` | Orchestrates the 4-stage pipeline, manages parallel explorers |
| `src/lib/think-explorers.ts` | The 4 explorer agent implementations (semantic, people, temporal, graph) |
| `src/lib/think-synthesizer.ts` | Opus synthesis call (shared by live and batch modes) |

### Modified Files

| File | Change |
|------|--------|
| `src/app/api/ai/think/route.ts` | Refactored to use pipeline |
| `src/components/UserProfilePage.tsx` | New batch option + status polling |
| `prisma/schema.prisma` | New NoteThinkTriage model |
| `src/lib/ai-tools.ts` | No changes — explorers reuse existing `executeTool` and `readOnlyVaultTools` |

### Unchanged

- `ThinkResult` output shape — no downstream breaking changes
- How connections are appended to notes
- How `UserInsight` entries are stored with `source: "think"`
- How people insights are routed to person notes via `addNotePerson`
- Person summary regeneration (fire-and-forget)
- Embedding cache pre-loading
- The `conditionalUpdateNote` staleness guard

## Cost Summary

| Scenario | Current | Live mode | Batch mode |
|----------|---------|-----------|------------|
| Per note | $0.05-0.15 | $0.15-0.35 | $0.10-0.20 |
| 20-note sweep | $1-3 | $3-7 | $2-4 |

## Edge Cases

- **Explorer returns empty results:** Synthesizer works with whatever it gets. If all four explorers return nothing meaningful, Opus returns empty connections (same as current behavior for notes with no connections).
- **Opus JSON parsing:** Same fence-stripping and `\{[\s\S]*\}` extraction as current think. Opus is more reliable at structured output than Sonnet, so this should improve.
- **Batch timeout:** Anthropic batches complete within 24 hours. The status endpoint handles in-progress, completed, and failed states.
- **Triage false negatives:** The permissive prompt minimizes these. Users can always run live think on any specific note regardless of triage result.
- **Explorer tool errors:** Non-fatal, same as current think. Explorer returns whatever it found before the error.
- **Concurrent edits during pipeline:** Same `conditionalUpdateNote` staleness guard. Note is re-fetched before writing connections.
- **Embedding cache:** Loaded once at pipeline start, shared across all explorer agents via the `meta` parameter.
