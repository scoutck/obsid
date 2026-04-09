# /think Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/think` slash command that performs deep, multi-strategy reasoning on a note and appends a Connections section with wiki-links and reasoning.

**Architecture:** New `/api/ai/think` route with a tool-use loop (extended thinking + read-only vault tools). Organize gains summary generation. Embeddings enriched with summaries. Four new search tools. Existing tool-use loops hardened with iteration caps and error handling.

**Tech Stack:** Next.js 16, Anthropic SDK (Claude Sonnet, Haiku), Prisma/SQLite, Voyage AI embeddings, CodeMirror 6

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | Add `summary` field to Note model |
| `prisma/migrations/YYYYMMDD_add_note_summary/migration.sql` | Migration SQL |
| `src/types/index.ts` | Update `Note` interface and `parseNote` for `summary` |
| `src/lib/notes.ts` | New query functions: `searchByTags`, `getNotesByPerson`, `getNoteGraph`, `searchByTimeframe` |
| `src/lib/embeddings.ts` | Accept summary in `embedNote`, add caching to `semanticSearch` |
| `src/lib/ai-tools.ts` | 4 new tool defs, `readOnlyVaultTools` export, cache threading |
| `src/app/api/ai/think/route.ts` | New endpoint — tool-use loop with extended thinking |
| `src/app/api/ai/organize/route.ts` | Add Haiku summary generation step |
| `src/app/api/ai/route.ts` | Iteration cap + error handling |
| `src/app/api/ai/chat/route.ts` | Iteration cap + error handling |
| `src/app/api/ai/command/route.ts` | Iteration cap |
| `src/editor/slash-commands.ts` | Add `/think` command entry |
| `src/app/page.tsx` | Handle `ai:think` action |
| `tests/lib/notes.test.ts` | Tests for new query functions |
| `tests/lib/embeddings.test.ts` | Tests for summary-enriched embedding + caching |
| `tests/lib/ai-tools.test.ts` | Tests for new tools + read-only export |

---

### Task 1: Schema — add `summary` field to Note

**Files:**
- Modify: `prisma/schema.prisma:9-19`
- Create: `prisma/migrations/20260409000000_add_note_summary/migration.sql`
- Modify: `src/types/index.ts:9-18, 95-116`

- [ ] **Step 1: Add `summary` field to Prisma schema**

In `prisma/schema.prisma`, add `summary` after `content`:

```prisma
model Note {
  id               String   @id @default(uuid())
  title            String   @default("")
  content          String   @default("")
  summary          String   @default("")
  tags             String   @default("[]")
  type             String   @default("")
  links            String   @default("[]")
  unresolvedPeople String   @default("[]")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

- [ ] **Step 2: Create migration SQL**

Create `prisma/migrations/20260409000000_add_note_summary/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Note" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 3: Apply migration and generate client**

Run:
```bash
npx prisma migrate deploy && npx prisma generate
```
Expected: Migration applied, client regenerated with `summary` field.

- [ ] **Step 4: Update Note interface in types**

In `src/types/index.ts`, add `summary` to the `Note` interface:

```typescript
export interface Note {
  id: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  type: string;
  links: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 5: Update parseNote to include summary**

In `src/types/index.ts`, update the `parseNote` function's parameter type and return:

```typescript
export function parseNote(raw: {
  id: string;
  title: string;
  content: string;
  summary?: string;
  tags: string;
  type: string;
  links: string;
  unresolvedPeople?: string;
  createdAt: Date;
  updatedAt: Date;
}): Note {
  return {
    id: raw.id,
    title: raw.title,
    content: raw.content,
    summary: raw.summary ?? "",
    tags: safeParseArray(raw.tags),
    type: raw.type,
    links: safeParseArray(raw.links),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
```

Note: `summary` is optional in the raw input (`summary?: string`) so existing callers that don't select it won't break. Defaults to `""`.

- [ ] **Step 6: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7: Run existing tests**

Run:
```bash
npm test
```
Expected: All existing tests pass. The `summary` field defaults to `""` so nothing breaks.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260409000000_add_note_summary/ src/types/index.ts
git commit -m "feat: add summary field to Note model"
```

---

### Task 2: New query functions in notes.ts

**Files:**
- Modify: `src/lib/notes.ts`
- Modify: `tests/lib/notes.test.ts`

- [ ] **Step 1: Write failing tests for searchByTags**

Add to `tests/lib/notes.test.ts`:

```typescript
import {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
  searchByTags,
  getNotesByPerson,
  getNoteGraph,
  searchByTimeframe,
} from "@/lib/notes";

// ... existing tests ...

describe("searchByTags", () => {
  it("finds notes matching any of the given tags", async () => {
    await createNote({ title: "A", tags: ["work", "meeting"] });
    await createNote({ title: "B", tags: ["personal"] });
    await createNote({ title: "C", tags: ["work", "idea"] });

    const results = await searchByTags(["work"]);
    expect(results).toHaveLength(2);
    expect(results.map((n) => n.title).sort()).toEqual(["A", "C"]);
  });

  it("returns empty array when no tags match", async () => {
    await createNote({ title: "A", tags: ["work"] });
    const results = await searchByTags(["nonexistent"]);
    expect(results).toHaveLength(0);
  });

  it("deduplicates when a note matches multiple tags", async () => {
    await createNote({ title: "A", tags: ["work", "meeting"] });
    const results = await searchByTags(["work", "meeting"]);
    expect(results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- tests/lib/notes.test.ts
```
Expected: FAIL — `searchByTags` is not exported.

- [ ] **Step 3: Implement searchByTags**

Add to `src/lib/notes.ts`:

```typescript
export async function searchByTags(
  tags: string[],
  db: PrismaClient = defaultPrisma
): Promise<Note[]> {
  if (tags.length === 0) return [];
  // Tags are stored as JSON arrays. Use LIKE for each tag.
  const conditions = tags.map(() => `tags LIKE ?`).join(" OR ");
  const params = tags.map((t) => `%"${t}"%`);
  const raw = await db.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      content: string;
      summary: string;
      tags: string;
      type: string;
      links: string;
      unresolvedPeople: string;
      createdAt: string;
      updatedAt: string;
    }>
  >(
    `SELECT * FROM "Note" WHERE (${conditions}) ORDER BY updatedAt DESC`,
    ...params
  );
  // Deduplicate (a note matching multiple tags appears once in SQL due to row-level OR)
  return raw.map((r) =>
    parseNote({
      ...r,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    })
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- tests/lib/notes.test.ts
```
Expected: All `searchByTags` tests PASS.

- [ ] **Step 5: Write failing tests for getNotesByPerson**

Add to `tests/lib/notes.test.ts` (also import `createPerson` and `addNotePerson`):

```typescript
import { createPerson, addNotePerson } from "@/lib/people";

// Add to beforeEach cleanup (before note.deleteMany):
//   await prisma.notePerson.deleteMany();
//   await prisma.personMeta.deleteMany();

describe("getNotesByPerson", () => {
  it("finds all notes linked to a person by alias", async () => {
    const person = await createPerson({ name: "Alice", role: "Engineer" });
    const noteA = await createNote({ title: "Meeting with Alice" });
    const noteB = await createNote({ title: "Project update" });
    await createNote({ title: "Unrelated" });

    await addNotePerson(noteA.id, person.note.id);
    await addNotePerson(noteB.id, person.note.id);

    const results = await getNotesByPerson("Alice");
    expect(results).toHaveLength(2);
    expect(results.map((n) => n.title).sort()).toEqual(["Meeting with Alice", "Project update"]);
  });

  it("returns empty array for unknown person", async () => {
    const results = await getNotesByPerson("Nobody");
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run:
```bash
npm test -- tests/lib/notes.test.ts
```
Expected: FAIL — `getNotesByPerson` is not exported.

- [ ] **Step 7: Implement getNotesByPerson**

Add to `src/lib/notes.ts`:

```typescript
import { getPersonByAlias } from "@/lib/people";

export async function getNotesByPerson(
  nameOrAlias: string,
  db: PrismaClient = defaultPrisma
): Promise<Note[]> {
  const person = await getPersonByAlias(nameOrAlias, db);
  if (!person) return [];

  const links = await db.notePerson.findMany({
    where: { personNoteId: person.note.id },
  });
  if (links.length === 0) return [];

  const noteIds = links.map((l) => l.noteId);
  const raw = await db.note.findMany({
    where: { id: { in: noteIds } },
    orderBy: { updatedAt: "desc" },
  });
  return raw.map(parseNote);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run:
```bash
npm test -- tests/lib/notes.test.ts
```
Expected: All `getNotesByPerson` tests PASS.

- [ ] **Step 9: Write failing tests for getNoteGraph**

Add to `tests/lib/notes.test.ts`:

```typescript
describe("getNoteGraph", () => {
  it("returns directly linked notes (depth 1)", async () => {
    const noteA = await createNote({ title: "Note A", content: "See [[Note B]] and [[Note C]]" });
    await createNote({ title: "Note B", content: "Some content" });
    await createNote({ title: "Note C", content: "More content" });

    const graph = await getNoteGraph(noteA.id, 1);
    expect(graph).toHaveLength(2);
    expect(graph.map((n) => n.note.title).sort()).toEqual(["Note B", "Note C"]);
    expect(graph.every((n) => n.depth === 1)).toBe(true);
  });

  it("follows links two hops deep (depth 2)", async () => {
    const noteA = await createNote({ title: "Note A", content: "See [[Note B]]" });
    await createNote({ title: "Note B", content: "See [[Note C]]" });
    await createNote({ title: "Note C", content: "End of chain" });

    const graph = await getNoteGraph(noteA.id, 2);
    expect(graph).toHaveLength(2);
    const titles = graph.map((n) => n.note.title);
    expect(titles).toContain("Note B");
    expect(titles).toContain("Note C");
  });

  it("returns empty array when note has no links", async () => {
    const note = await createNote({ title: "Isolated", content: "No links here" });
    const graph = await getNoteGraph(note.id);
    expect(graph).toHaveLength(0);
  });
});
```

- [ ] **Step 10: Run tests to verify they fail**

Run:
```bash
npm test -- tests/lib/notes.test.ts
```
Expected: FAIL — `getNoteGraph` is not exported.

- [ ] **Step 11: Implement getNoteGraph**

Add to `src/lib/notes.ts`:

```typescript
import { extractWikiLinks } from "@/editor/wiki-links";

export interface NoteGraphEntry {
  note: Note;
  depth: number;
}

export async function getNoteGraph(
  noteId: string,
  depth: number = 2,
  db: PrismaClient = defaultPrisma
): Promise<NoteGraphEntry[]> {
  const visited = new Set<string>([noteId]);
  const result: NoteGraphEntry[] = [];

  let currentIds = [noteId];

  for (let d = 1; d <= depth; d++) {
    // Fetch all current-layer notes
    const currentNotes = await db.note.findMany({
      where: { id: { in: currentIds } },
    });

    // Extract all wiki-links from current layer
    const linkedTitles = new Set<string>();
    for (const raw of currentNotes) {
      const links = extractWikiLinks(raw.content);
      for (const title of links) {
        linkedTitles.add(title);
      }
    }

    if (linkedTitles.size === 0) break;

    // Resolve titles to notes (case-insensitive)
    const allNotes = await db.$queryRawUnsafe<
      Array<{
        id: string;
        title: string;
        content: string;
        summary: string;
        tags: string;
        type: string;
        links: string;
        unresolvedPeople: string;
        createdAt: string;
        updatedAt: string;
      }>
    >(`SELECT * FROM "Note"`);

    const titleMap = new Map(
      allNotes.map((n) => [n.title.toLowerCase(), n])
    );

    const nextIds: string[] = [];
    for (const title of linkedTitles) {
      const raw = titleMap.get(title.toLowerCase());
      if (raw && !visited.has(raw.id)) {
        visited.add(raw.id);
        result.push({
          note: parseNote({
            ...raw,
            createdAt: new Date(raw.createdAt),
            updatedAt: new Date(raw.updatedAt),
          }),
          depth: d,
        });
        nextIds.push(raw.id);
      }
    }

    currentIds = nextIds;
    if (currentIds.length === 0) break;
  }

  return result;
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run:
```bash
npm test -- tests/lib/notes.test.ts
```
Expected: All `getNoteGraph` tests PASS.

- [ ] **Step 13: Write failing tests for searchByTimeframe**

Add to `tests/lib/notes.test.ts`:

```typescript
describe("searchByTimeframe", () => {
  it("finds notes updated within the given date range", async () => {
    const note = await createNote({ title: "Recent note" });
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const results = await searchByTimeframe(yesterday, tomorrow);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((n) => n.id === note.id)).toBe(true);
  });

  it("returns empty when no notes in range", async () => {
    await createNote({ title: "A note" });
    const farPast = new Date("2020-01-01");
    const farPastEnd = new Date("2020-01-02");
    const results = await searchByTimeframe(farPast, farPastEnd);
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 14: Run tests to verify they fail**

Run:
```bash
npm test -- tests/lib/notes.test.ts
```
Expected: FAIL — `searchByTimeframe` is not exported.

- [ ] **Step 15: Implement searchByTimeframe**

Add to `src/lib/notes.ts`:

```typescript
export async function searchByTimeframe(
  startDate: Date,
  endDate: Date,
  db: PrismaClient = defaultPrisma
): Promise<Note[]> {
  const raw = await db.note.findMany({
    where: {
      updatedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return raw.map(parseNote);
}
```

- [ ] **Step 16: Run tests to verify they pass**

Run:
```bash
npm test -- tests/lib/notes.test.ts
```
Expected: All `searchByTimeframe` tests PASS.

- [ ] **Step 17: Run full test suite**

Run:
```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 18: Commit**

```bash
git add src/lib/notes.ts tests/lib/notes.test.ts
git commit -m "feat: add search-by-tags, person, graph, timeframe query functions"
```

---

### Task 3: Enriched embeddings with summary + caching

**Files:**
- Modify: `src/lib/embeddings.ts`
- Modify: `tests/lib/embeddings.test.ts`

- [ ] **Step 1: Read current embeddings test file**

Read `tests/lib/embeddings.test.ts` to understand existing test patterns.

- [ ] **Step 2: Update embedNote signature to accept summary**

In `src/lib/embeddings.ts`, change the `embedNote` function:

```typescript
export async function embedNote(
  noteId: string,
  title: string,
  content: string,
  db: PrismaClient = defaultPrisma,
  summary: string = ""
): Promise<void> {
  const text = summary
    ? `${title}\n${summary}\n${content}`.trim()
    : `${title}\n${content}`.trim();
  if (!text) return;
```

Note: `summary` is after `db` to maintain backward compatibility. Existing callers pass `(noteId, title, content, db)` — the `summary` defaults to `""`.

- [ ] **Step 3: Add EmbeddingCache type and cached semanticSearch**

In `src/lib/embeddings.ts`, add:

```typescript
export interface EmbeddingCache {
  items: Array<{ id: string; vector: Float32Array }>;
}

export async function loadEmbeddingCache(
  db: PrismaClient = defaultPrisma
): Promise<EmbeddingCache> {
  const embeddings = await db.embedding.findMany();
  const items = embeddings.map((e) => ({
    id: e.noteId,
    vector: new Float32Array(
      e.vector.buffer,
      e.vector.byteOffset,
      e.vector.byteLength / 4
    ),
  }));
  return { items };
}
```

Then update `semanticSearch` to accept an optional cache:

```typescript
export async function semanticSearch(
  query: string,
  limit: number = 10,
  db: PrismaClient = defaultPrisma,
  cache?: EmbeddingCache
): Promise<Array<{ noteId: string; score: number }>> {
  const queryVector = await embedText(query);

  const items = cache
    ? cache.items
    : (await db.embedding.findMany()).map((e) => ({
        id: e.noteId,
        vector: new Float32Array(
          e.vector.buffer,
          e.vector.byteOffset,
          e.vector.byteLength / 4
        ),
      }));

  return rankBySimilarity(queryVector, items, limit).map((r) => ({
    noteId: r.id,
    score: r.score,
  }));
}
```

- [ ] **Step 4: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors. All existing callers of `embedNote` and `semanticSearch` still work (new params are optional).

- [ ] **Step 5: Run existing tests**

Run:
```bash
npm test -- tests/lib/embeddings.test.ts
```
Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/embeddings.ts
git commit -m "feat: enrich embeddings with summary, add embedding cache for multi-query"
```

---

### Task 4: New search tools in ai-tools.ts

**Files:**
- Modify: `src/lib/ai-tools.ts`
- Create: `tests/lib/ai-tools.test.ts`

- [ ] **Step 1: Add 4 new tool definitions**

In `src/lib/ai-tools.ts`, add to the `vaultTools` array (before the closing `]`):

```typescript
  {
    name: "search_by_tags",
    description:
      "Find notes that have any of the given tags. Useful for finding thematically grouped notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to search for",
        },
      },
      required: ["tags"],
    },
  },
  {
    name: "search_by_person",
    description:
      "Find all notes that mention or are linked to a specific person. Use their name or any known alias.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Person name or alias to search for",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_note_graph",
    description:
      "Follow [[wiki-links]] from a note to discover connected notes. Returns notes up to N hops away.",
    input_schema: {
      type: "object" as const,
      properties: {
        noteId: {
          type: "string",
          description: "The UUID of the starting note",
        },
        depth: {
          type: "number",
          description: "How many hops to follow (default 2, max 3)",
        },
      },
      required: ["noteId"],
    },
  },
  {
    name: "search_by_timeframe",
    description:
      "Find notes created or updated within a date range. Useful for finding temporal clusters.",
    input_schema: {
      type: "object" as const,
      properties: {
        startDate: {
          type: "string",
          description: "Start date (ISO format, e.g., 2026-01-01)",
        },
        endDate: {
          type: "string",
          description: "End date (ISO format, e.g., 2026-01-31)",
        },
      },
      required: ["startDate", "endDate"],
    },
  },
```

- [ ] **Step 2: Add imports for new query functions**

At the top of `src/lib/ai-tools.ts`, update imports:

```typescript
import { searchNotes, getNote, createNote, updateNote, searchByTags, getNotesByPerson, getNoteGraph, searchByTimeframe } from "@/lib/notes";
```

- [ ] **Step 3: Add tool execution cases**

In the `executeTool` switch statement, add before the `default` case:

```typescript
    case "search_by_tags": {
      const tags = input.tags as string[];
      const notes = await searchByTags(tags, db);
      if (notes.length === 0) return "No notes found with those tags.";
      return notes
        .slice(0, 20)
        .map(
          (n) =>
            `- **${n.title || "Untitled"}** (id: ${n.id})\n  Tags: ${n.tags.join(", ")}\n  Preview: ${n.content.slice(0, 150)}...`
        )
        .join("\n\n");
    }

    case "search_by_person": {
      const notes = await getNotesByPerson(input.name as string, db);
      if (notes.length === 0)
        return `No notes found mentioning "${input.name}".`;
      return notes
        .slice(0, 20)
        .map(
          (n) =>
            `- **${n.title || "Untitled"}** (id: ${n.id})\n  Preview: ${n.content.slice(0, 150)}...`
        )
        .join("\n\n");
    }

    case "get_note_graph": {
      const depth = Math.min((input.depth as number) ?? 2, 3);
      const graph = await getNoteGraph(input.noteId as string, depth, db);
      if (graph.length === 0) return "No linked notes found.";
      return graph
        .map(
          (entry) =>
            `- **${entry.note.title || "Untitled"}** (id: ${entry.note.id}, ${entry.depth} hop${entry.depth > 1 ? "s" : ""} away)\n  Preview: ${entry.note.content.slice(0, 150)}...`
        )
        .join("\n\n");
    }

    case "search_by_timeframe": {
      const start = new Date(input.startDate as string);
      const end = new Date(input.endDate as string);
      const notes = await searchByTimeframe(start, end, db);
      if (notes.length === 0) return "No notes found in that timeframe.";
      return notes
        .slice(0, 20)
        .map(
          (n) =>
            `- **${n.title || "Untitled"}** (id: ${n.id}, updated: ${n.updatedAt.toISOString().split("T")[0]})\n  Preview: ${n.content.slice(0, 150)}...`
        )
        .join("\n\n");
    }
```

- [ ] **Step 4: Export readOnlyVaultTools**

At the bottom of `src/lib/ai-tools.ts`, add:

```typescript
const WRITE_TOOLS = new Set([
  "create_note",
  "update_note",
  "update_person",
  "create_pending_person",
]);

export const readOnlyVaultTools = vaultTools.filter(
  (t) => !WRITE_TOOLS.has(t.name)
);
```

- [ ] **Step 5: Add EmbeddingCache threading to executeTool**

Update the `meta` parameter type and thread cache through `semantic_search`:

```typescript
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  meta?: {
    sourceNoteId?: string;
    sourceConversationId?: string;
    cookie?: string;
    embeddingCache?: import("@/lib/embeddings").EmbeddingCache;
  },
  db: PrismaClient = defaultPrisma
): Promise<string> {
```

Then in the `semantic_search` case, pass the cache:

```typescript
    case "semantic_search": {
      try {
        const results = await semanticSearch(
          input.query as string,
          (input.limit as number) ?? 10,
          db,
          meta?.embeddingCache
        );
```

Add the import at top:

```typescript
import { semanticSearch, type EmbeddingCache } from "@/lib/embeddings";
```

And remove the existing `semanticSearch` from the `@/lib/embeddings` import if it's already imported without the type.

- [ ] **Step 6: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7: Write test for readOnlyVaultTools**

Create `tests/lib/ai-tools.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { vaultTools, readOnlyVaultTools } from "@/lib/ai-tools";

describe("readOnlyVaultTools", () => {
  it("excludes write tools", () => {
    const names = readOnlyVaultTools.map((t) => t.name);
    expect(names).not.toContain("create_note");
    expect(names).not.toContain("update_note");
    expect(names).not.toContain("update_person");
    expect(names).not.toContain("create_pending_person");
  });

  it("includes read tools and new search tools", () => {
    const names = readOnlyVaultTools.map((t) => t.name);
    expect(names).toContain("semantic_search");
    expect(names).toContain("read_note");
    expect(names).toContain("list_people");
    expect(names).toContain("search_by_tags");
    expect(names).toContain("search_by_person");
    expect(names).toContain("get_note_graph");
    expect(names).toContain("search_by_timeframe");
  });

  it("has fewer tools than full vaultTools", () => {
    expect(readOnlyVaultTools.length).toBe(vaultTools.length - 4);
  });
});
```

- [ ] **Step 8: Run tests**

Run:
```bash
npm test -- tests/lib/ai-tools.test.ts
```
Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai-tools.ts tests/lib/ai-tools.test.ts
git commit -m "feat: add search-by-tags/person/graph/timeframe tools, read-only export"
```

---

### Task 5: Harden existing tool-use loops

**Files:**
- Modify: `src/app/api/ai/route.ts`
- Modify: `src/app/api/ai/chat/route.ts`
- Modify: `src/app/api/ai/command/route.ts`

- [ ] **Step 1: Add iteration cap + error handling to ask route**

Replace the tool-use loop in `src/app/api/ai/route.ts` (lines 44-75):

```typescript
  const MAX_TOOL_ROUNDS = 10;
  let toolRounds = 0;

  // Handle tool use loop
  while (response.stop_reason === "tool_use" && toolRounds < MAX_TOOL_ROUNDS) {
    toolRounds++;
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
            { cookie },
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
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: vaultTools,
      messages,
    });
  }
```

Also wrap the initial API call in try/catch:

```typescript
  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: vaultTools,
      messages,
    });
  } catch (err) {
    console.error("[ask] AI request failed:", err);
    return new Response("AI request failed", { status: 502 });
  }
```

- [ ] **Step 2: Add iteration cap + error handling to chat route**

Replace the tool-use loop in `src/app/api/ai/chat/route.ts` (lines 84-121):

```typescript
  const MAX_TOOL_ROUNDS = 10;
  let toolRounds = 0;

  // Tool-use loop
  const fullMessages = [...messages];
  const allToolCalls: Array<{ name: string; input: Record<string, unknown> }> =
    [];
  while (
    response.stop_reason === "tool_use" &&
    toolRounds < MAX_TOOL_ROUNDS
  ) {
    toolRounds++;
    const assistantContent = response.content;
    fullMessages.push({ role: "assistant", content: assistantContent });

    const toolBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolBlocks.map(async (block) => {
        try {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            { sourceConversationId: conversationId, cookie },
            db
          );
          allToolCalls.push({
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
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

    fullMessages.push({ role: "user", content: toolResults });

    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        tools: vaultTools,
        messages: fullMessages,
      });
    } catch (err) {
      console.error("[chat] AI request failed during tool loop:", err);
      return Response.json({ error: "AI request failed" }, { status: 502 });
    }
  }
```

- [ ] **Step 3: Add iteration cap to command route**

In `src/app/api/ai/command/route.ts`, the initial call is already in try/catch. Add a counter to the loop (line 62):

```typescript
    let toolRounds = 0;
    const MAX_TOOL_ROUNDS = 10;

    while (response.stop_reason === "tool_use" && toolRounds < MAX_TOOL_ROUNDS) {
      toolRounds++;
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
              { sourceNoteId: noteId, cookie },
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        tools: vaultTools,
        messages,
      });
    }
```

- [ ] **Step 4: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai/route.ts src/app/api/ai/chat/route.ts src/app/api/ai/command/route.ts
git commit -m "fix: add iteration caps, error handling, parallel tool execution to AI routes"
```

---

### Task 6: Summary generation in organize

**Files:**
- Modify: `src/app/api/ai/organize/route.ts`
- Modify: `src/lib/notes.ts` (add summary to `conditionalUpdateNote`)

- [ ] **Step 1: Update conditionalUpdateNote to support summary**

In `src/lib/notes.ts`, update `UpdateNoteInput` and `conditionalUpdateNote`:

Add `summary` to `UpdateNoteInput`:

```typescript
interface UpdateNoteInput {
  title?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  type?: string;
  links?: string[];
}
```

In `conditionalUpdateNote`, add summary handling after the content block:

```typescript
  if (input.summary !== undefined) {
    sets.push(`summary = ?`);
    params.push(input.summary);
  }
```

- [ ] **Step 2: Add Haiku summary generation to organize route**

In `src/app/api/ai/organize/route.ts`, after the existing Sonnet call and JSON parse (after line 128), add the summary generation:

```typescript
  // Generate semantic summary via Haiku (fast, cheap)
  let summary = "";
  if (content.trim().length > 50) {
    try {
      const summaryResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Analyze this note and extract its underlying themes, tensions, and meaning in 2-3 sentences. Not a synopsis — what is this note REALLY about? What emotions, questions, or patterns are present beneath the surface?

Title: ${title}
Content:
${content}

Return only the summary text, nothing else.`,
          },
        ],
      });
      for (const block of summaryResponse.content) {
        if (block.type === "text") summary += block.text;
      }
      summary = summary.trim();
    } catch (err) {
      console.error("[organize] Summary generation failed:", err);
      // Non-fatal — continue without summary
    }
  }
```

- [ ] **Step 3: Pass summary to conditionalUpdateNote**

Update the `conditionalUpdateNote` call in organize to include the summary:

```typescript
  const updated = await conditionalUpdateNote(
    noteId,
    new Date(snapshotUpdatedAt),
    {
      content: updatedContent,
      tags: finalTags,
      summary,
    },
    db
  );
```

- [ ] **Step 4: Pass summary to embedNote**

Update the `embedNote` call to include the summary:

```typescript
  // Fire-and-forget embedding trigger
  embedNote(noteId, title, updatedContent, db, summary).catch((err) =>
    console.error("[organize] embedNote failed:", err)
  );
```

- [ ] **Step 5: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ai/organize/route.ts src/lib/notes.ts
git commit -m "feat: generate semantic summary in organize, pass to embeddings"
```

---

### Task 7: /think API endpoint

**Files:**
- Create: `src/app/api/ai/think/route.ts`

- [ ] **Step 1: Create the /think endpoint**

Create `src/app/api/ai/think/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { readOnlyVaultTools, executeTool } from "@/lib/ai-tools";
import { getNote, conditionalUpdateNote } from "@/lib/notes";
import { loadEmbeddingCache } from "@/lib/embeddings";
import { createUserInsights } from "@/lib/user-insights";
import { embedNote } from "@/lib/embeddings";
import { extractInlineTags } from "@/lib/tags";

const anthropic = new Anthropic();
const MAX_TOOL_ROUNDS = 10;

interface ThinkResult {
  connections: string;
  insights: Array<{ category: string; content: string; evidence?: string }>;
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const { noteId } = await request.json();

  const note = await getNote(noteId, db);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const snapshotUpdatedAt = note.updatedAt.getTime();

  // Pre-load embedding cache for multi-query efficiency
  const embeddingCache = await loadEmbeddingCache(db);

  const systemPrompt = `You are a deep reasoning engine for a personal knowledge base called Obsid. Your job is to find meaningful connections between the current note and other notes in the vault.

## Current note
Title: ${note.title}
Content:
${note.content}

## Your task
Explore the vault using the tools available to you. Search by meaning, by people, by tags, by time, and by following wiki-links. Read promising notes in full. Then identify connections that the user might not see themselves.

## Connection types to look for
- **Contradictions**: The user said X here but Y in another note
- **Evolution**: Their thinking on a topic shifted over time
- **Recurring patterns**: The same dynamic or tension appearing across notes
- **Unresolved tensions**: Questions or conflicts they keep circling without resolving
- **Causal chains**: A decision in one note led to an outcome in another

## How to explore
1. Start by thinking about what this note is really about — the themes beneath the surface
2. Search semantically for related notes
3. Search by people mentioned, tags used, and time period
4. Follow wiki-links to discover the note's neighborhood
5. Read the most promising notes in full
6. Think carefully about HOW they connect — not just that they're similar

## Output format
Return valid JSON (no markdown fences):
{
  "connections": "Markdown text with [[wiki-links]] explaining each connection and WHY it matters. Use bullet points.",
  "insights": [{"category": "behavior|self-reflection|expertise|thinking-pattern", "content": "insight text", "evidence": "quote from note"}]
}

The connections text should be specific and reference note content. Not "these notes are related" but "in [[Note X]] you described feeling Y, and here you're experiencing the same tension from a different angle."

If you find no meaningful connections, return: {"connections": "", "insights": []}`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "Find deep connections between this note and the rest of my vault. Use the tools to explore thoroughly.",
    },
  ];

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      system: systemPrompt,
      tools: readOnlyVaultTools,
      messages,
      thinking: {
        type: "enabled",
        budget_tokens: 5000,
      },
    });
  } catch (err) {
    console.error("[think] AI request failed:", err);
    return Response.json({ error: "AI request failed" }, { status: 502 });
  }

  let toolRounds = 0;
  while (
    response.stop_reason === "tool_use" &&
    toolRounds < MAX_TOOL_ROUNDS
  ) {
    toolRounds++;
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
            { sourceNoteId: noteId, embeddingCache },
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

    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: systemPrompt,
        tools: readOnlyVaultTools,
        messages,
        thinking: {
          type: "enabled",
          budget_tokens: 5000,
        },
      });
    } catch (err) {
      console.error("[think] AI request failed during tool loop:", err);
      return Response.json({ error: "AI request failed" }, { status: 502 });
    }
  }

  // Extract final text
  let resultText = "";
  for (const block of response.content) {
    if (block.type === "text") resultText += block.text;
  }

  // Strip markdown fences if present
  resultText = resultText
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let result: ThinkResult;
  try {
    result = JSON.parse(resultText);
  } catch {
    console.error(
      "[think] Failed to parse AI response:",
      resultText.slice(0, 200)
    );
    return Response.json(
      { error: "Failed to parse AI response" },
      { status: 500 }
    );
  }

  // Append connections to note content
  let connectionsAdded = false;
  if (result.connections && result.connections.trim()) {
    const connectionsSection = `\n\n---\n**Connections**\n${result.connections.trim()}\n`;
    const updatedContent = note.content.trimEnd() + connectionsSection;
    const finalTags = extractInlineTags(updatedContent);

    const updated = await conditionalUpdateNote(
      noteId,
      new Date(snapshotUpdatedAt),
      { content: updatedContent, tags: finalTags },
      db
    );

    if (updated) {
      connectionsAdded = true;
      // Re-embed with connections included
      embedNote(noteId, note.title, updatedContent, db, note.summary).catch(
        (err) => console.error("[think] embedNote failed:", err)
      );
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
      })),
      db
    );
    insightsAdded = created.length;
  }

  return Response.json({
    connectionsAdded,
    insightsAdded,
    connections: result.connections || "",
  });
}
```

- [ ] **Step 2: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/think/route.ts
git commit -m "feat: add /api/ai/think endpoint with tool-use loop and extended thinking"
```

---

### Task 8: Slash command registration + page handler

**Files:**
- Modify: `src/editor/slash-commands.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add /think to slash commands**

In `src/editor/slash-commands.ts`, add after the "Claude Command" entry (line 41):

```typescript
  { label: "Think", category: "AI", description: "Find deep connections for this note", action: "ai:think", mode: "notes" },
```

- [ ] **Step 2: Add handler in page.tsx**

In `src/app/page.tsx`, find the `handleSlashCommand` callback. Add the `ai:think` handler after the `ai:claude` block (after line 380):

```typescript
      if (command.action === "ai:think") {
        if (!noteId) return;
        // Cancel pending auto-save to avoid stale detection
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        setToast("Thinking deeply...");
        fetch("/api/ai/think", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId }),
        })
          .then(async (res) => {
            if (!res.ok) {
              setToast("Think failed");
              return;
            }
            const result = await res.json();
            if (result.connectionsAdded) {
              loadNote(noteId);
              const parts: string[] = [];
              if (result.connections) parts.push("connections found");
              if (result.insightsAdded > 0)
                parts.push(`${result.insightsAdded} insights`);
              setToast(parts.join(", ") || "No connections found");
            } else {
              setToast("No connections found");
            }
          })
          .catch(() => setToast("Think failed"));
        return;
      }
```

- [ ] **Step 3: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Verify slash command test still passes**

Run:
```bash
npm test -- tests/editor/slash-commands.test.ts
```
Expected: All tests pass. The new command is additive.

- [ ] **Step 5: Commit**

```bash
git add src/editor/slash-commands.ts src/app/page.tsx
git commit -m "feat: add /think slash command and page handler"
```

---

### Task 9: Final integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run:
```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 2: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Run linter**

Run:
```bash
npm run lint
```
Expected: No errors.

- [ ] **Step 4: Run build**

Run:
```bash
npm run build
```
Expected: Build succeeds.

- [ ] **Step 5: Manual smoke test**

Start dev server:
```bash
npm run dev
```

1. Open a note with some content
2. Type `/think` — verify it appears in the slash menu
3. Select it — verify "Thinking deeply..." toast appears
4. Wait for completion — verify connections section is appended to the note
5. Run `/organize` on a note — verify it still works (summary generation is transparent)

- [ ] **Step 6: Final commit if any fixes needed**

If any issues found in smoke testing, fix and commit with appropriate message.
