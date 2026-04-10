# /think v2 — Vault-Wide Sweep from /me

## Problem

Per-note `/think` has a single-note bias problem. If your most recent note says "I'm so confident," the insights reflect that even if 50 other notes show the opposite. Insights need to come from cross-vault reasoning, not individual notes.

Additionally, `/think` only runs when the user remembers to invoke it on specific notes, so most notes never get deep analysis.

## Solution

Move `/think` from a per-note slash command to a vault-wide sweep triggered by a button on the `/me` profile page. It processes all notes that have changed since the last sweep, producing per-note connections, user insights for `/me`, and people insights for person pages. Old insights accumulate — new sweeps add to them, never replace.

## Scope — v2

- Button on `/me` page triggers the sweep (no slash command)
- Client-driven sequential processing (one note at a time, no timeouts)
- Progress UI on `/me` page during sweep
- People insights routed to person pages
- `lastThinkAt` derived from existing data (no new tracking table)
- Profile synthesis reflects current state (temporal/evolution view deferred)

## Architecture

### Trigger flow

1. User opens `/me`, clicks "Think" button
2. Client calls `GET /api/ai/think-sweep/pending` — returns notes needing processing
3. Client loops through notes sequentially, calling `POST /api/ai/think` for each
4. Each call produces: per-note connections (appended to note content), user insights (`UserInsight` table), people insights (appended to person notes)
5. Progress shown: "Thinking about 'note title'... 3 of 12"
6. When complete, `/me` re-fetches insights and re-synthesizes the profile

### Why client-driven

A single server-side request processing 10+ notes would take 2-5 minutes and risk timeouts on Railway. Client-driven processing makes each request independent (~10-30s per note), provides natural per-note progress, and reuses the existing `/think` endpoint.

## Changes

### 1. Schema — add `source` to UserInsight

Add a `source` field to distinguish where insights come from:

```prisma
model UserInsight {
  // ... existing fields
  source String @default("organize")
}
```

Values: `"organize"` (from organize flow, default for existing rows) or `"think"` (from /think sweep).

This enables deriving `lastThinkAt` from `MAX(createdAt) WHERE source = 'think'` — no separate tracking table needed.

### 2. New endpoint: `GET /api/ai/think-sweep/pending`

Returns the list of notes that need processing.

**Logic:**
- Query the most recent `UserInsight` where `source = 'think'` to get `lastThinkAt`
- If none exists, `lastThinkAt = null` (process all notes)
- Find all notes where `updatedAt > lastThinkAt` (or all notes if `lastThinkAt` is null)
- Exclude person notes (`type != 'person'`)
- Order by `updatedAt ASC` (oldest first, so sweep progresses chronologically)

**Response:**
```json
{
  "notes": [{ "id": "...", "title": "..." }],
  "lastThinkAt": "2026-04-09T12:00:00Z" | null,
  "total": 12
}
```

### 3. Modify existing `/api/ai/think` endpoint

The endpoint already works per-note. Changes:

**Prompt expansion:** Add instructions to also produce:
- People insights — observations about specific people discovered during reasoning

**Response format update:** Add `peopleInsights` to the expected JSON:
```json
{
  "connections": "markdown with [[wiki-links]]...",
  "insights": [{ "category": "...", "content": "...", "evidence": "..." }],
  "peopleInsights": [{ "name": "Person Name", "observation": "what was discovered" }]
}
```

**People insights processing:** After parsing the response, for each entry in `peopleInsights`:
- Resolve the person via `getPersonByAlias`
- If found, append the observation to their person note (same pattern as `update_person` in `ai-tools.ts`)
- Fire-and-forget person summary regeneration

**Source marking:** Pass `source: "think"` when creating `UserInsight` entries via `createUserInsights`.

### 4. Modify `UserInsight` creation

Update `createUserInsight` / `createUserInsights` in `src/lib/user-insights.ts` to accept an optional `source` parameter (default `"organize"`).

### 5. Remove `/think` slash command

- Remove the `{ label: "Think", ... action: "ai:think" }` entry from `slash-commands.ts`
- Remove the `ai:think` handler from `page.tsx`'s `handleSlashCommand`

### 6. `/me` page — Think button + progress UI

**Button:** Add a "Think" button in the header area of `UserProfilePage`. Disabled while a sweep is in progress.

**On click:**
1. Fetch `GET /api/ai/think-sweep/pending`
2. If no notes to process, show "All caught up — no new notes since last think"
3. Otherwise, enter progress mode:
   - Show current note being processed: "Thinking about 'note title'... 3 of 12"
   - Simple progress bar or fraction indicator
   - Each note calls `POST /api/ai/think` sequentially
4. On completion: "Done — processed 12 notes" then auto-refresh insights + profile

**State:** A `sweepState` in the component:
```typescript
type SweepState =
  | { status: "idle" }
  | { status: "loading" }  // fetching pending notes
  | { status: "thinking"; current: number; total: number; noteTitle: string }
  | { status: "done"; processed: number };
```

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `source` field to UserInsight |
| `prisma/migrations/YYYYMMDD_add_insight_source/migration.sql` | Migration |
| `src/types/index.ts` | Add `source` to `UserInsight` interface |
| `src/lib/user-insights.ts` | Accept `source` param in create functions |
| `src/app/api/ai/think-sweep/pending/route.ts` | New endpoint |
| `src/app/api/ai/think/route.ts` | Add people insights, source marking, prompt expansion |
| `src/editor/slash-commands.ts` | Remove Think entry |
| `src/app/page.tsx` | Remove `ai:think` handler, remove think-related toast/state |
| `src/components/UserProfilePage.tsx` | Think button + progress UI |

## Cost

Same as v1 per note (~$0.07 Haiku, ~$0.28 Sonnet). Total cost per sweep depends on how many notes changed. A sweep of 10 notes at Sonnet pricing = ~$2.80.

## Out of Scope (future versions)

- Temporal profile synthesis (show how patterns evolve over time)
- Auto-triggering sweeps (nightly batch, on login, etc.)
- Batch API for cheaper vault-wide processing
- Progress streaming via SSE (currently polling-free, client drives the loop)
