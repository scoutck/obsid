# /think v2 — Vault-Wide Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move /think from a per-note slash command to a vault-wide sweep triggered from the /me page, routing insights to user profile and person pages.

**Architecture:** Client-driven sequential processing — the /me page fetches pending notes, then calls the existing /think endpoint per-note. Schema gains a `source` field on UserInsight to derive lastThinkAt. The /think prompt expands to produce people insights. The slash command is removed.

**Tech Stack:** Next.js 16, Anthropic SDK, Prisma/SQLite, React

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | Add `source` field to UserInsight |
| `prisma/migrations/YYYYMMDD_add_insight_source/migration.sql` | Migration |
| `src/types/index.ts` | Add `source` to UserInsight interface + parseUserInsight |
| `src/lib/user-insights.ts` | Accept `source` param in create functions, add `getLastThinkAt` |
| `src/app/api/ai/think-sweep/pending/route.ts` | New endpoint — returns notes needing processing |
| `src/app/api/ai/think/route.ts` | Add people insights, source marking, prompt expansion |
| `src/editor/slash-commands.ts` | Remove Think entry |
| `src/app/page.tsx` | Remove `ai:think` handler and related state |
| `src/components/UserProfilePage.tsx` | Think button + sweep progress UI |

---

### Task 1: Schema — add `source` to UserInsight

**Files:**
- Modify: `prisma/schema.prisma:111-121`
- Create: `prisma/migrations/20260409100000_add_insight_source/migration.sql`
- Modify: `src/types/index.ts:161-182`

- [ ] **Step 1: Add `source` field to UserInsight in schema**

In `prisma/schema.prisma`, add `source` to the UserInsight model after `sourceNoteId`:

```prisma
model UserInsight {
  id           String   @id @default(uuid())
  category     String
  content      String
  evidence     String   @default("")
  sourceNoteId String?
  source       String   @default("organize")
  createdAt    DateTime @default(now())

  @@index([category])
  @@index([sourceNoteId])
  @@index([source])
}
```

- [ ] **Step 2: Create migration SQL**

Create `prisma/migrations/20260409100000_add_insight_source/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "UserInsight" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'organize';

-- CreateIndex
CREATE INDEX "UserInsight_source_idx" ON "UserInsight"("source");
```

- [ ] **Step 3: Apply migration and generate client**

Run:
```bash
npx prisma migrate deploy && npx prisma generate
```
Expected: Migration applied, client regenerated.

- [ ] **Step 4: Update UserInsight interface in types**

In `src/types/index.ts`, add `source` to the `UserInsight` interface:

```typescript
export interface UserInsight {
  id: string;
  category: "self-reflection" | "expertise" | "behavior" | "thinking-pattern";
  content: string;
  evidence: string;
  sourceNoteId: string | null;
  source: "organize" | "think";
  createdAt: Date;
}
```

- [ ] **Step 5: Update parseUserInsight to include source**

In `src/types/index.ts`, update `parseUserInsight`:

```typescript
export function parseUserInsight(raw: {
  id: string;
  category: string;
  content: string;
  evidence: string;
  sourceNoteId: string | null;
  source?: string;
  createdAt: Date;
}): UserInsight {
  return {
    ...raw,
    category: raw.category as UserInsight["category"],
    source: (raw.source as UserInsight["source"]) ?? "organize",
  };
}
```

- [ ] **Step 6: Run type check and tests**

Run:
```bash
npx tsc --noEmit && npm test
```
Expected: No errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260409100000_add_insight_source/ src/types/index.ts
git commit -m "feat: add source field to UserInsight (organize vs think)"
```

---

### Task 2: Update user-insights.ts to accept source

**Files:**
- Modify: `src/lib/user-insights.ts`
- Modify: `tests/lib/user-insights.test.ts`

- [ ] **Step 1: Add source to CreateUserInsightInput**

In `src/lib/user-insights.ts`, update the interface:

```typescript
interface CreateUserInsightInput {
  category: string;
  content: string;
  evidence?: string;
  sourceNoteId?: string;
  source?: string;
}
```

- [ ] **Step 2: Pass source through to create**

In `createUserInsight`, add source to the create data:

```typescript
export async function createUserInsight(
  input: CreateUserInsightInput,
  db: PrismaClient = defaultPrisma
): Promise<UserInsight> {
  const category = VALID_CATEGORIES.includes(input.category) ? input.category : "self-reflection";
  const raw = await db.userInsight.create({
    data: {
      category,
      content: input.content,
      evidence: input.evidence ?? "",
      sourceNoteId: input.sourceNoteId ?? null,
      source: input.source ?? "organize",
    },
  });
  return parseUserInsight(raw);
}
```

- [ ] **Step 3: Add getLastThinkAt function**

Add to `src/lib/user-insights.ts`:

```typescript
export async function getLastThinkAt(
  db: PrismaClient = defaultPrisma
): Promise<Date | null> {
  const latest = await db.userInsight.findFirst({
    where: { source: "think" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return latest?.createdAt ?? null;
}
```

- [ ] **Step 4: Write test for getLastThinkAt**

Add to `tests/lib/user-insights.test.ts`:

```typescript
import { getLastThinkAt } from "@/lib/user-insights";

describe("getLastThinkAt", () => {
  it("returns null when no think insights exist", async () => {
    const result = await getLastThinkAt();
    expect(result).toBeNull();
  });

  it("returns the most recent think insight createdAt", async () => {
    await createUserInsight({ category: "behavior", content: "organize insight", source: "organize" });
    await createUserInsight({ category: "behavior", content: "think insight", source: "think" });

    const result = await getLastThinkAt();
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 5: Run tests**

Run:
```bash
npm test -- tests/lib/user-insights.test.ts
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/user-insights.ts tests/lib/user-insights.test.ts
git commit -m "feat: add source param to insight creation, add getLastThinkAt"
```

---

### Task 3: New endpoint — pending notes for sweep

**Files:**
- Create: `src/app/api/ai/think-sweep/pending/route.ts`

- [ ] **Step 1: Create the endpoint**

Create `src/app/api/ai/think-sweep/pending/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getLastThinkAt } from "@/lib/user-insights";
import { parseNote } from "@/types";

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
```

- [ ] **Step 2: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/think-sweep/pending/route.ts
git commit -m "feat: add think-sweep/pending endpoint for vault-wide sweep"
```

---

### Task 4: Expand /think endpoint — people insights + source marking

**Files:**
- Modify: `src/app/api/ai/think/route.ts`

- [ ] **Step 1: Update ThinkResult interface**

In `src/app/api/ai/think/route.ts`, update the interface:

```typescript
interface ThinkResult {
  connections: string;
  insights: Array<{ category: string; content: string; evidence?: string }>;
  peopleInsights?: Array<{ name: string; observation: string }>;
}
```

- [ ] **Step 2: Expand the system prompt**

In the output format section of the system prompt, update the JSON format to include peopleInsights:

Replace the output format section (the part starting with `## Output format`) with:

```typescript
## Output format
Return valid JSON (no markdown fences):
{
  "connections": "Markdown text with [[wiki-links]] explaining each connection and WHY it matters. Use bullet points.",
  "insights": [{"category": "behavior|self-reflection|expertise|thinking-pattern", "content": "insight text", "evidence": "quote from note"}],
  "peopleInsights": [{"name": "Person Name", "observation": "what you discovered about this person across notes"}]
}

The connections text should be specific and reference note content. Not "these notes are related" but "in [[Note X]] you described feeling Y, and here you're experiencing the same tension from a different angle."

peopleInsights should capture observations about specific people — patterns in how the user interacts with them, how the person's role or behavior appears across notes. Use the person's primary name as listed in the known people list.

If you find no meaningful connections, return: {"connections": "", "insights": [], "peopleInsights": []}
```

- [ ] **Step 3: Pass source to createUserInsights**

Update the insights creation to pass `source: "think"`:

```typescript
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
```

- [ ] **Step 4: Add people insights processing**

After the user insights block and before the `return Response.json(...)`, add:

```typescript
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
```

- [ ] **Step 5: Add required imports**

Add to the imports at the top of the file:

```typescript
import { getPersonByAlias } from "@/lib/people";
import { updateNote } from "@/lib/notes";
```

Note: `getNote` is already imported. `updateNote` needs to be added to the existing import from `@/lib/notes`.

- [ ] **Step 6: Update the return value**

Update the final `Response.json`:

```typescript
  return Response.json({
    connectionsAdded,
    insightsAdded,
    peopleInsightsAdded,
    connections: result.connections || "",
  });
```

- [ ] **Step 7: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/ai/think/route.ts
git commit -m "feat: expand /think with people insights, source marking, updated prompt"
```

---

### Task 5: Remove /think slash command + page handler

**Files:**
- Modify: `src/editor/slash-commands.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Remove Think from slash commands**

In `src/editor/slash-commands.ts`, remove this line:

```typescript
  { label: "Think", category: "AI", description: "Find deep connections for this note", action: "ai:think", mode: "notes" },
```

- [ ] **Step 2: Remove ai:think handler from page.tsx**

In `src/app/page.tsx`, remove the entire `if (command.action === "ai:think")` block (lines 383-431 approximately). This includes the content save, fetch to `/api/ai/think`, and all the toast handling.

- [ ] **Step 3: Clean up unused state if applicable**

Check if `toastDuration` and `setToastDuration` are used anywhere else in `page.tsx` besides the removed think handler. If only used by think, remove the `toastDuration` state and revert the Toast component to use the default duration.

If `toastDuration` is still used elsewhere, keep it.

- [ ] **Step 4: Run type check and slash command tests**

Run:
```bash
npx tsc --noEmit && npm test -- tests/editor/slash-commands.test.ts
```
Expected: No errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/editor/slash-commands.ts src/app/page.tsx
git commit -m "feat: remove /think slash command, now triggered from /me page"
```

---

### Task 6: UserProfilePage — Think button + sweep progress

**Files:**
- Modify: `src/components/UserProfilePage.tsx`

- [ ] **Step 1: Add sweep state type and state**

Add the sweep state type and state variables after the existing state declarations:

```typescript
type SweepState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "thinking"; current: number; total: number; noteTitle: string }
  | { status: "done"; processed: number }
  | { status: "error"; message: string };

// Inside the component, after existing useState calls:
const [sweep, setSweep] = useState<SweepState>({ status: "idle" });
```

- [ ] **Step 2: Add the runSweep function**

Add after the `fetchData` callback:

```typescript
  const runSweep = useCallback(async () => {
    setSweep({ status: "loading" });

    // Fetch pending notes
    let pending;
    try {
      const res = await fetch("/api/ai/think-sweep/pending");
      if (!res.ok) {
        setSweep({ status: "error", message: "Failed to fetch pending notes" });
        return;
      }
      pending = await res.json();
    } catch {
      setSweep({ status: "error", message: "Failed to fetch pending notes" });
      return;
    }

    if (pending.total === 0) {
      setSweep({ status: "done", processed: 0 });
      return;
    }

    // Process each note sequentially
    let processed = 0;
    for (const note of pending.notes) {
      setSweep({
        status: "thinking",
        current: processed + 1,
        total: pending.total,
        noteTitle: note.title || "Untitled",
      });

      try {
        await fetch("/api/ai/think", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: note.id }),
        });
        processed++;
      } catch {
        // Continue processing remaining notes even if one fails
        console.error(`[think-sweep] Failed to process note ${note.id}`);
      }
    }

    setSweep({ status: "done", processed });

    // Refresh insights after sweep
    fetchData();
  }, [fetchData]);
```

- [ ] **Step 3: Add Think button to the header**

In the header section, after the insights count paragraph, add:

```tsx
          <div className="mt-3">
            {sweep.status === "idle" && (
              <button
                onClick={runSweep}
                className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Think
              </button>
            )}
            {sweep.status === "loading" && (
              <p className="text-xs text-zinc-400">Finding notes to analyze...</p>
            )}
            {sweep.status === "thinking" && (
              <div>
                <p className="text-xs text-zinc-500">
                  Thinking about &ldquo;{sweep.noteTitle}&rdquo;... {sweep.current} of {sweep.total}
                </p>
                <div className="mt-1 w-48 h-1 bg-zinc-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${(sweep.current / sweep.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {sweep.status === "done" && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-zinc-500">
                  {sweep.processed === 0
                    ? "All caught up — no new notes since last think"
                    : `Done — processed ${sweep.processed} note${sweep.processed !== 1 ? "s" : ""}`}
                </p>
                <button
                  onClick={() => setSweep({ status: "idle" })}
                  className="text-xs text-indigo-500 hover:text-indigo-700"
                >
                  Dismiss
                </button>
              </div>
            )}
            {sweep.status === "error" && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-red-500">{sweep.message}</p>
                <button
                  onClick={() => setSweep({ status: "idle" })}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
```

- [ ] **Step 4: Run type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/UserProfilePage.tsx
git commit -m "feat: add Think button with sweep progress to /me page"
```

---

### Task 7: Final integration verification

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

- [ ] **Step 3: Run build**

Run:
```bash
npm run build
```
Expected: Build succeeds.

- [ ] **Step 4: Manual smoke test**

Start dev server: `npm run dev`

1. Open `/me` via the slash menu
2. Verify "Think" button is visible
3. Click it — verify progress UI shows ("Finding notes to analyze..." then "Thinking about 'note title'... 1 of N")
4. Wait for completion — verify "Done — processed N notes" message
5. Verify insights list is updated with new entries
6. Open a note that was processed — verify connections section was appended
7. Open a person page — verify observations were added (if applicable)
8. Verify `/think` no longer appears in the slash menu
9. Click "Think" again immediately — verify "All caught up — no new notes since last think"

- [ ] **Step 5: Commit any fixes**

If any issues found in smoke testing, fix and commit.
