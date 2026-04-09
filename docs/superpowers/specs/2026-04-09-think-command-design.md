# /think Command — Deep Note Reasoning

## Problem

The organize system is surface-level. It matches note titles, resolves people names, and appends wiki-links, but it never actually *reads* related notes or reasons about *why* they connect. The result is a knowledge base with links but no insight.

## Solution

A `/think` slash command that performs deep, multi-strategy reasoning on a single note. The AI reads the note, explores the vault using multiple search tools, and appends a **Connections** section explaining how the note relates to others — with specific `[[wiki-links]]` and reasoning about connection types (contradictions, evolutions, recurring patterns, unresolved tensions).

Additionally, organize gains a semantic summary generation step that enriches embeddings, making all search — including `/think`'s — more conceptually aware.

## Scope — v1

- `/think` is **on-demand only** (user invokes it explicitly)
- Auto-run on every note is deferred to a future version
- Connections section is appended to the note content
- User insights are written as a byproduct of deep reasoning

## Feature Set

### 1. Summary Generation (organize enhancement)

During the existing organize flow, add a Haiku call that generates a semantic summary of the note. Not a synopsis — an extraction of underlying themes, tensions, and meaning.

- Stored in a new `summary` field on the `Note` model
- Runs on every note close as part of organize (fire-and-forget, like today)
- Prompt focus: "What is this note *really* about? What themes, tensions, questions, or patterns are present beneath the surface?"
- Cost: ~$0.001/note

### 2. Enriched Embeddings

Change `embedNote` to embed `title + summary + content` (concatenated) instead of `title + content`. The summary adds a conceptual layer to the vector so semantic search finds meaning-based connections, not just word-based ones.

- No schema change needed — same `Embedding` table, same vector dimensions
- Backward compatible — notes without summaries still embed `title + content`

### 3. New Search Tools

Four new tools added to `ai-tools.ts` for richer vault exploration:

**`search_by_tags(tags: string[])`**
- Find notes that share any of the given tags
- Query: `Note.findMany` with tag filtering (JSON `tags` field contains any of the given tags)
- Returns: note titles, IDs, previews

**`search_by_person(name: string)`**
- Find all notes linked to a specific person (by name or alias)
- Query: resolve alias via `getPersonByAlias`, then `NotePerson.findMany({ where: { personNoteId } })` to get linked note IDs, then fetch those notes
- Returns: note titles, IDs, previews, the person's role

**`get_note_graph(noteId: string, depth?: number)`**
- Follow `[[wiki-links]]` out 1-2 hops from a given note
- Parse wiki-links from the note's content via `extractWikiLinks`, resolve to note IDs by title match, then repeat for hop 2
- Default depth: 2
- Returns: adjacency list with note titles, IDs, previews, and hop distance

**`search_by_timeframe(startDate: string, endDate: string)`**
- Find notes created or updated within a date range
- Query: `Note.findMany({ where: { updatedAt: { gte, lte } } })`
- Returns: note titles, IDs, previews, dates

All new tools are read-only. They are added to `ai-tools.ts` alongside existing vault tools. A separate `readOnlyVaultTools` array is exported for `/think` (excludes `create_note`, `update_note`, `update_person`, `create_pending_person`).

### 4. `/think` Slash Command

**Slash command registration:**
- Added to `slash-commands.ts` with `action: "ai:think"`, `mode: "notes"` (notes mode only)
- Handler in `page.tsx` calls `/api/ai/think` with the current note ID

**API endpoint — `/api/ai/think/route.ts`:**

Architecture: tool-use loop with extended thinking, mirroring the command route pattern.

**System prompt** instructs Claude to:
- Read the current note deeply and identify underlying themes
- Explore the vault using multiple search strategies
- Read promising notes in full
- Identify specific connection types: contradictions, evolutions, recurring patterns, unresolved tensions, causal chains
- Return a connections section with `[[wiki-links]]` and reasoning
- Also return any user insights discovered through cross-note reasoning

**Tool set:** read-only vault tools — `semantic_search`, `read_note`, `list_people`, `search_by_tags`, `search_by_person`, `get_note_graph`, `search_by_timeframe`

**Model:** Claude Sonnet (same as other AI routes). Haiku is a viable alternative for cost savings — model choice is a hardcoded constant, easy to swap.

**Extended thinking:** enabled with `budget_tokens: 5000` per turn (hardcoded constant).

**Loop:** max 10 tool rounds, then force a final response.

**Response format:** Claude returns JSON:
```json
{
  "connections": "markdown string to append to note",
  "insights": [{"category": "behavior", "content": "...", "evidence": "..."}]
}
```
The prompt instructs Claude to format `connections` as markdown with `[[wiki-links]]` and reasoning. Strip markdown fences before parsing (same pattern as organize).

**Output processing:**
1. Parse JSON from Claude's final response
2. Append `---\n**Connections**\n` + `result.connections` to the note content via `conditionalUpdateNote` (same staleness guard as organize)
3. Store `result.insights` to the `UserInsight` table with `sourceNoteId`
4. Fire-and-forget re-embed the note (connections text becomes part of future embeddings)

**Response to client:**
```json
{
  "connections": ["summary of what was found"],
  "insightsAdded": 2
}
```

**UX flow:**
1. User types `/think` while viewing a note
2. Spinner/loading state shows (expect 5-15 seconds)
3. Note content updates with the connections section appended
4. Toast notification: "Found N connections"

### 5. Tool-Use Loop Hardening

Fix existing issues across all AI routes before building `/think` on this pattern:

**Iteration cap:**
- Add `const MAX_TOOL_ROUNDS = 10` to `route.ts` (ask), `chat/route.ts`, `command/route.ts`
- Break the loop and return partial results if exceeded
- `/think` uses the same cap

**Error handling:**
- Wrap inner loop body in try/catch in `route.ts` and `chat/route.ts`
- On tool execution error, return `{ type: "tool_result", tool_use_id, content: "Error: ...", is_error: true }` instead of crashing the route

**Parallel tool execution:**
- When Claude returns multiple `tool_use` blocks in one response, execute them with `Promise.all` instead of sequential `for...await`

### 6. Semantic Search Caching

For `/think` calls that run multiple semantic searches, avoid loading all embeddings from DB on every call.

- Add an optional `embeddingCache` parameter to `semanticSearch`
- On first call within a `/think` invocation, load all embeddings and pass the cache to subsequent calls
- Cache is request-scoped (not global) — garbage collected when the request ends

Implementation: `executeTool` receives an optional cache object in `meta`, passes it through to `semanticSearch`.

## Data Changes

### Schema

```prisma
model Note {
  // ... existing fields
  summary String @default("")
}
```

Migration: `ALTER TABLE Note ADD COLUMN summary TEXT NOT NULL DEFAULT '';`

No other schema changes. `UserInsight` table already exists. `Embedding` table unchanged.

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `summary` field to Note |
| `src/lib/notes.ts` | New query functions: `searchByTags`, `searchByPerson`, `getNoteGraph`, `searchByTimeframe` |
| `src/lib/ai-tools.ts` | 4 new tool definitions, `readOnlyVaultTools` export, embedding cache in `executeTool` |
| `src/lib/embeddings.ts` | Embed `title + summary + content`, add cache parameter to `semanticSearch` |
| `src/app/api/ai/think/route.ts` | New endpoint |
| `src/app/api/ai/organize/route.ts` | Add Haiku summary generation |
| `src/editor/slash-commands.ts` | Add `/think` command |
| `src/app/page.tsx` | Handle `ai:think` slash command |
| `src/app/api/ai/route.ts` | Iteration cap + error handling |
| `src/app/api/ai/chat/route.ts` | Iteration cap + error handling |
| `src/app/api/ai/command/route.ts` | Iteration cap |
| `src/types/index.ts` | Update `parseNote` to include `summary` field |

## Cost

| Component | Per note | Monthly (10 notes/day) |
|---|---|---|
| Summary generation (Haiku, auto) | $0.001 | $0.30 |
| Enriched embedding (Voyage, auto) | existing | existing |
| `/think` invocation (Sonnet) | $0.28 | usage-dependent |
| `/think` invocation (Haiku) | $0.07 | usage-dependent |

## Out of Scope (future versions)

- Auto-run `/think` on every note (cost optimization needed first)
- Nightly batch processing via Anthropic Batch API
- Tiered approach: light connections in organize, deep in `/think`
- Connection staleness detection (re-run `/think` when linked notes change)
- UI for browsing the connection graph visually
