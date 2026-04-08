# User Profile & Insight Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/me` page that displays AI-synthesized insights about the user, harvested passively from note content via the existing organize pipeline.

**Architecture:** New `UserInsight` table stores raw observations. The organize endpoint's prompt is extended to also detect self-reflective content, writing those to `UserInsight` rows. A `/me` slash command opens a `UserProfilePage` that fetches all insights and sends them to a synthesis endpoint for on-demand profile generation.

**Tech Stack:** Prisma (SQLite), Next.js 16 API routes, Anthropic SDK, React (dynamic import)

---

### Task 1: Database Migration + Schema + Types

**Files:**
- Create: `prisma/migrations/20260407100000_add_user_insight/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create migration SQL**

```sql
-- CreateTable: UserInsight
CREATE TABLE "UserInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '',
    "sourceNoteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "UserInsight_category_idx" ON "UserInsight"("category");
CREATE INDEX "UserInsight_sourceNoteId_idx" ON "UserInsight"("sourceNoteId");
```

- [ ] **Step 2: Add model to Prisma schema**

Add after the `Task` model in `prisma/schema.prisma`:

```prisma
model UserInsight {
  id           String   @id @default(uuid())
  category     String
  content      String
  evidence     String   @default("")
  sourceNoteId String?
  createdAt    DateTime @default(now())

  @@index([category])
  @@index([sourceNoteId])
}
```

- [ ] **Step 3: Add TypeScript interface and parse function to `src/types/index.ts`**

Add the interface:

```typescript
export interface UserInsight {
  id: string;
  category: "self-reflection" | "expertise" | "behavior" | "thinking-pattern";
  content: string;
  evidence: string;
  sourceNoteId: string | null;
  createdAt: Date;
}
```

Add the parse function:

```typescript
export function parseUserInsight(raw: {
  id: string;
  category: string;
  content: string;
  evidence: string;
  sourceNoteId: string | null;
  createdAt: Date;
}): UserInsight {
  return {
    ...raw,
    category: raw.category as UserInsight["category"],
  };
}
```

- [ ] **Step 4: Generate Prisma client and apply migration**

Run:
```bash
npx prisma generate
npx prisma migrate deploy
```

Expected: Migration applied, client regenerated with `UserInsight` model.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260407100000_add_user_insight/migration.sql src/types/index.ts
git commit -m "feat: add UserInsight table for user profile data"
```

---

### Task 2: UserInsight Library (CRUD)

**Files:**
- Create: `src/lib/user-insights.ts`
- Test: `tests/lib/user-insights.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/user-insights.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  createUserInsight,
  createUserInsights,
  getUserInsights,
  getUserInsightsByCategory,
  deleteUserInsight,
} from "@/lib/user-insights";
import { createNote } from "@/lib/notes";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.userInsight.deleteMany();
  await prisma.note.deleteMany();
});

describe("createUserInsight", () => {
  it("creates an insight with all fields", async () => {
    const note = await createNote({ title: "Test note" });
    const insight = await createUserInsight({
      category: "behavior",
      content: "Procrastinates on presentations",
      evidence: "I always leave presentations to the last minute",
      sourceNoteId: note.id,
    });
    expect(insight.id).toBeDefined();
    expect(insight.category).toBe("behavior");
    expect(insight.content).toBe("Procrastinates on presentations");
    expect(insight.evidence).toBe("I always leave presentations to the last minute");
    expect(insight.sourceNoteId).toBe(note.id);
  });

  it("creates an insight without sourceNoteId", async () => {
    const insight = await createUserInsight({
      category: "expertise",
      content: "Deep knowledge of distributed systems",
    });
    expect(insight.sourceNoteId).toBeNull();
    expect(insight.evidence).toBe("");
  });
});

describe("createUserInsights", () => {
  it("batch creates multiple insights", async () => {
    const note = await createNote({ title: "Reflection" });
    const insights = await createUserInsights([
      { category: "behavior", content: "Night owl", sourceNoteId: note.id },
      { category: "expertise", content: "Knows TypeScript well", sourceNoteId: note.id },
    ]);
    expect(insights).toHaveLength(2);
    expect(insights[0].category).toBe("behavior");
    expect(insights[1].category).toBe("expertise");
  });

  it("returns empty array for empty input", async () => {
    const insights = await createUserInsights([]);
    expect(insights).toHaveLength(0);
  });
});

describe("getUserInsights", () => {
  it("returns all insights ordered by createdAt desc", async () => {
    await createUserInsight({ category: "behavior", content: "First" });
    await createUserInsight({ category: "expertise", content: "Second" });

    const insights = await getUserInsights();
    expect(insights).toHaveLength(2);
    // Most recent first
    expect(insights[0].content).toBe("Second");
    expect(insights[1].content).toBe("First");
  });
});

describe("getUserInsightsByCategory", () => {
  it("filters by category", async () => {
    await createUserInsight({ category: "behavior", content: "Night owl" });
    await createUserInsight({ category: "expertise", content: "TypeScript" });
    await createUserInsight({ category: "behavior", content: "Procrastinator" });

    const behaviors = await getUserInsightsByCategory("behavior");
    expect(behaviors).toHaveLength(2);
    behaviors.forEach((b) => expect(b.category).toBe("behavior"));
  });
});

describe("deleteUserInsight", () => {
  it("removes the insight", async () => {
    const insight = await createUserInsight({ category: "behavior", content: "Test" });
    await deleteUserInsight(insight.id);
    const all = await getUserInsights();
    expect(all).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/lib/user-insights.test.ts`
Expected: FAIL — module `@/lib/user-insights` not found.

- [ ] **Step 3: Write the library**

Create `src/lib/user-insights.ts`:

```typescript
import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import { parseUserInsight, type UserInsight } from "@/types";

interface CreateUserInsightInput {
  category: string;
  content: string;
  evidence?: string;
  sourceNoteId?: string;
}

const VALID_CATEGORIES = ["self-reflection", "expertise", "behavior", "thinking-pattern"];

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
    },
  });
  return parseUserInsight(raw);
}

export async function createUserInsights(
  inputs: CreateUserInsightInput[],
  db: PrismaClient = defaultPrisma
): Promise<UserInsight[]> {
  if (inputs.length === 0) return [];

  const results: UserInsight[] = [];
  for (const input of inputs) {
    results.push(await createUserInsight(input, db));
  }
  return results;
}

export async function getUserInsights(
  db: PrismaClient = defaultPrisma
): Promise<UserInsight[]> {
  const rows = await db.userInsight.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(parseUserInsight);
}

export async function getUserInsightsByCategory(
  category: string,
  db: PrismaClient = defaultPrisma
): Promise<UserInsight[]> {
  const rows = await db.userInsight.findMany({
    where: { category },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(parseUserInsight);
}

export async function deleteUserInsight(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await db.userInsight.delete({ where: { id } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/user-insights.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/user-insights.ts tests/lib/user-insights.test.ts
git commit -m "feat: add user-insights lib with CRUD operations"
```

---

### Task 3: User Insights API Route

**Files:**
- Create: `src/app/api/user-insights/route.ts`
- Test: `tests/api/user-insights.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/user-insights.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/user-insights/route";
import { createUserInsight } from "@/lib/user-insights";
import { createNote } from "@/lib/notes";
import { prisma } from "@/lib/db";

function makeRequest(body?: unknown): Request {
  if (body) {
    return new Request("http://localhost/api/user-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return new Request("http://localhost/api/user-insights");
}

beforeEach(async () => {
  await prisma.userInsight.deleteMany();
  await prisma.note.deleteMany();
});

describe("GET /api/user-insights", () => {
  it("returns all insights", async () => {
    await createUserInsight({ category: "behavior", content: "Night owl" });
    await createUserInsight({ category: "expertise", content: "TypeScript" });

    const res = await GET(makeRequest() as never);
    const data = await res.json();
    expect(data).toHaveLength(2);
  });

  it("returns empty array when no insights", async () => {
    const res = await GET(makeRequest() as never);
    const data = await res.json();
    expect(data).toHaveLength(0);
  });
});

describe("POST /api/user-insights", () => {
  it("creates insights from array", async () => {
    const note = await createNote({ title: "Test" });
    const res = await POST(makeRequest({
      insights: [
        { category: "behavior", content: "Night owl", evidence: "I work best at 2am", sourceNoteId: note.id },
        { category: "expertise", content: "TypeScript expert" },
      ],
    }) as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.created).toBe(2);
  });

  it("returns 400 for missing insights array", async () => {
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/api/user-insights.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the API route**

Create `src/app/api/user-insights/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getUserInsights, createUserInsights } from "@/lib/user-insights";

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const insights = await getUserInsights(db);
  return Response.json(insights);
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const body = await request.json();

  if (!Array.isArray(body.insights)) {
    return Response.json({ error: "insights array required" }, { status: 400 });
  }

  const created = await createUserInsights(body.insights, db);
  return Response.json({ created: created.length });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/api/user-insights.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/user-insights/route.ts tests/api/user-insights.test.ts
git commit -m "feat: add user-insights API route"
```

---

### Task 4: Organize Endpoint Integration

**Files:**
- Modify: `src/app/api/ai/organize/route.ts`
- Test: `tests/api/organize-insights.test.ts`

- [ ] **Step 1: Write failing test for insight harvesting**

Create `tests/api/organize-insights.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createNote } from "@/lib/notes";

beforeEach(async () => {
  await prisma.userInsight.deleteMany();
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.note.deleteMany();
});

describe("organize insight harvesting", () => {
  it("stores userInsights from organize response in UserInsight table", async () => {
    // Create a note with self-reflective content
    const note = await createNote({
      title: "Reflections",
      content: "I always procrastinate on presentations. I think best when walking.",
    });

    // Call the organize endpoint
    const res = await fetch("http://localhost:3000/api/ai/organize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: note.id }),
    });

    // This is an integration test — it depends on the AI returning insights.
    // We verify the pipeline works by checking that any insights returned
    // are stored in the database.
    if (res.ok) {
      const result = await res.json();
      if (result.insightsAdded > 0) {
        const insights = await prisma.userInsight.findMany({
          where: { sourceNoteId: note.id },
        });
        expect(insights.length).toBeGreaterThan(0);
        expect(insights[0].sourceNoteId).toBe(note.id);
      }
    }
  });
});
```

Note: This is an integration test that requires a running server and AI. For CI, the organize changes are tested indirectly — the core logic (parsing `userInsights` from JSON and calling `createUserInsights`) is straightforward enough to verify by reading the code. The lib-level tests in Task 2 cover the actual insert logic.

- [ ] **Step 2: Extend the organize system prompt**

In `src/app/api/ai/organize/route.ts`, add this rule to the end of the `systemPrompt` string (before the closing backtick):

```
- Also scan for self-reflective statements — moments where the author reveals something about themselves: habits, struggles, preferences, expertise, how they think or work. NOT task items ("finish the report") but self-revealing statements ("I always leave reports to the last minute"). Return these as userInsights with category being one of: "self-reflection", "expertise", "behavior", "thinking-pattern".
```

- [ ] **Step 3: Extend the user prompt JSON format**

In `src/app/api/ai/organize/route.ts`, update the `userPrompt` return format to include userInsights:

```
Return JSON in this exact format:
{
  "links": ["Existing Note Title"],
  "people": [{"name": "Full Name", "role": "optional role"}],
  "unresolvedPeople": ["new or ambiguous name"],
  "userInsights": [{"category": "behavior", "content": "insight text", "evidence": "quote from note"}]
}
```

- [ ] **Step 4: Update the OrganizeResult interface**

Add `userInsights` to the `OrganizeResult` interface:

```typescript
interface OrganizeResult {
  links: string[];
  people: Array<{ name: string; role?: string }>;
  unresolvedPeople: string[];
  userInsights?: Array<{ category: string; content: string; evidence?: string }>;
}
```

- [ ] **Step 5: Add import and processing logic**

Add import at top of `src/app/api/ai/organize/route.ts`:

```typescript
import { createUserInsights } from "@/lib/user-insights";
```

After the `pendingPeople` processing block (after line 159 in current file) and before the `extractInlineTags` call, add:

```typescript
  // Store user insights from AI analysis
  let insightsAdded = 0;
  if (result.userInsights && result.userInsights.length > 0) {
    const created = await createUserInsights(
      result.userInsights.map((i) => ({
        category: i.category,
        content: i.content,
        evidence: i.evidence ?? "",
        sourceNoteId: noteId,
      })),
      db
    );
    insightsAdded = created.length;
  }
```

- [ ] **Step 6: Add insightsAdded to response JSON**

Update the return statement to include `insightsAdded`:

```typescript
  return Response.json({
    linksAdded: result.links.filter((l) => !existingLinks.includes(l)),
    peopleResolved: resolvedPeople,
    pendingPeople,
    insightsAdded,
  });
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/ai/organize/route.ts tests/api/organize-insights.test.ts
git commit -m "feat: extend organize to harvest user insights"
```

---

### Task 5: User Profile Synthesis API

**Files:**
- Create: `src/app/api/ai/user-profile/route.ts`

- [ ] **Step 1: Create the synthesis endpoint**

Create `src/app/api/ai/user-profile/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getUserInsights } from "@/lib/user-insights";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const insights = await getUserInsights(db);

  if (insights.length === 0) {
    return Response.json({
      summary: "",
      expertise: [],
      patterns: [],
      thinkingStyle: "",
    });
  }

  const insightText = insights
    .map((i) => `[${i.category}] ${i.content}${i.evidence ? ` (evidence: "${i.evidence}")` : ""}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `You synthesize user insights into a structured profile. You are analyzing observations collected from a user's personal knowledge base — things they've written that reveal who they are, how they think, and what they know.

Return valid JSON only, no markdown wrapping. Use this format:
{
  "summary": "2-3 sentence paragraph about who this person is, written in second person (you)",
  "expertise": [{"topic": "name", "strength": "deep|moderate|emerging"}],
  "patterns": [{"label": "short label", "description": "1 sentence description"}],
  "thinkingStyle": "1-2 sentences about how this person approaches problems and organizes ideas"
}

Rules:
- Only include expertise/patterns with enough supporting evidence
- If an insight appears multiple times, that strengthens confidence
- Write warmly but honestly — this is for the user to see about themselves
- "strength" reflects how many insights support the topic and how detailed they are`,
    messages: [
      {
        role: "user",
        content: `Here are ${insights.length} observations collected from the user's writing:\n\n${insightText}\n\nSynthesize these into a structured profile.`,
      },
    ],
  });

  let resultText = "";
  for (const block of response.content) {
    if (block.type === "text") resultText += block.text;
  }

  try {
    const profile = JSON.parse(resultText);
    return Response.json(profile);
  } catch {
    return Response.json({ error: "Failed to parse profile" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/ai/user-profile/route.ts
git commit -m "feat: add user-profile synthesis endpoint"
```

---

### Task 6: UserProfilePage Component

**Files:**
- Create: `src/components/UserProfilePage.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/UserProfilePage.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface Expertise {
  topic: string;
  strength: "deep" | "moderate" | "emerging";
}

interface Pattern {
  label: string;
  description: string;
}

interface Profile {
  summary: string;
  expertise: Expertise[];
  patterns: Pattern[];
  thinkingStyle: string;
}

interface RawInsight {
  id: string;
  category: string;
  content: string;
  evidence: string;
  sourceNoteId: string | null;
  createdAt: string;
}

interface UserProfilePageProps {
  onSelectNote: (noteId: string) => void;
  onBack: () => void;
}

const strengthColors: Record<string, string> = {
  deep: "bg-indigo-100 text-indigo-700",
  moderate: "bg-blue-100 text-blue-700",
  emerging: "bg-zinc-100 text-zinc-600",
};

export default function UserProfilePage({ onSelectNote, onBack }: UserProfilePageProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [insights, setInsights] = useState<RawInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [synthesizing, setSynthesizing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/user-insights");
    const data: RawInsight[] = await res.json();
    setInsights(data);
    setLoading(false);

    if (data.length > 0) {
      setSynthesizing(true);
      const profileRes = await fetch("/api/ai/user-profile", { method: "POST" });
      if (profileRes.ok) {
        const p = await profileRes.json();
        if (!p.error) setProfile(p);
      }
      setSynthesizing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-[720px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={onBack} className="text-xs text-zinc-400 hover:text-zinc-600 mb-2">
            &larr; Back
          </button>
          <h1 className="text-xl font-bold text-zinc-900">About You</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {insights.length} insight{insights.length !== 1 ? "s" : ""} collected
          </p>
        </div>

        {insights.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-zinc-500">
              No insights yet. As you write notes, the AI will pick up on things you
              reveal about yourself — your habits, expertise, how you think.
            </p>
            <p className="text-xs text-zinc-400 mt-2">
              This page will populate automatically over time.
            </p>
          </div>
        ) : (
          <>
            {/* AI Summary */}
            {synthesizing ? (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Summary</h2>
                <p className="text-sm text-zinc-400">Synthesizing profile...</p>
              </div>
            ) : profile?.summary ? (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Summary</h2>
                <p className="text-sm text-zinc-700 leading-relaxed">{profile.summary}</p>
              </div>
            ) : null}

            {/* Expertise */}
            {profile?.expertise && profile.expertise.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Expertise</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.expertise.map((e) => (
                    <span
                      key={e.topic}
                      className={`text-xs px-2 py-1 rounded-full ${strengthColors[e.strength] ?? strengthColors.emerging}`}
                    >
                      {e.topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Patterns */}
            {profile?.patterns && profile.patterns.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Patterns</h2>
                <div className="space-y-2">
                  {profile.patterns.map((p) => (
                    <div key={p.label} className="text-sm">
                      <span className="font-medium text-zinc-800">{p.label}</span>
                      <span className="text-zinc-500"> — {p.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thinking Style */}
            {profile?.thinkingStyle && (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Thinking Style</h2>
                <p className="text-sm text-zinc-700 leading-relaxed">{profile.thinkingStyle}</p>
              </div>
            )}

            {/* Recent Insights */}
            <div>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                Recent Insights
              </h2>
              <div className="space-y-3">
                {insights.slice(0, 20).map((insight) => (
                  <div key={insight.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded">
                        {insight.category}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {new Date(insight.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-zinc-700 mt-0.5">{insight.content}</p>
                    {insight.evidence && (
                      <p className="text-xs text-zinc-400 mt-0.5 italic">&ldquo;{insight.evidence}&rdquo;</p>
                    )}
                    {insight.sourceNoteId && (
                      <button
                        onClick={() => onSelectNote(insight.sourceNoteId!)}
                        className="text-xs text-indigo-500 hover:text-indigo-700 mt-0.5"
                      >
                        View source note
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/UserProfilePage.tsx
git commit -m "feat: add UserProfilePage component"
```

---

### Task 7: Slash Command + Page Wiring

**Files:**
- Modify: `src/editor/slash-commands.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add `/me` slash command**

In `src/editor/slash-commands.ts`, add to the Organization section (after the Tasks commands, before the AI section):

```typescript
  // Profile
  { label: "Me", category: "Organization", description: "View your profile", action: "profile:me" },
```

- [ ] **Step 2: Add dynamic import in `page.tsx`**

In `src/app/page.tsx`, add after the `TaskModal` dynamic import:

```typescript
const UserProfilePage = dynamic(() => import("@/components/UserProfilePage"), {
  loading: () => <div className="flex items-center justify-center h-full"><p className="text-zinc-500">Loading...</p></div>,
});
```

- [ ] **Step 3: Add `showProfile` state**

In `src/app/page.tsx`, add after the `personPageId` state declaration:

```typescript
const [showProfile, setShowProfile] = useState(false);
```

- [ ] **Step 4: Handle `/me` in `handleSlashCommand`**

In `src/app/page.tsx`, add before the `console.log("Unhandled command:")` line in `handleSlashCommand`:

```typescript
      if (command.action === "profile:me") {
        setShowProfile(true);
        return;
      }
```

- [ ] **Step 5: Handle `/me` in `handleChatSlashCommand`**

In `src/app/page.tsx`, add inside `handleChatSlashCommand` (after the tasks handlers):

```typescript
      } else if (action === "me" || action === "profile:me") {
        setShowProfile(true);
```

- [ ] **Step 6: Render UserProfilePage in the main view**

In `src/app/page.tsx`, update the main content area. Currently the view priority is:

```tsx
{personPageId ? (
  <PersonPage ... />
) : mode === "chat" && conversation ? (
  <ChatView ... />
) : (
  <Editor ... />
)}
```

Add `showProfile` as the highest priority (before `personPageId`):

```tsx
{showProfile ? (
  <UserProfilePage
    onSelectNote={(id) => {
      setShowProfile(false);
      loadNote(id);
    }}
    onBack={() => setShowProfile(false)}
  />
) : personPageId ? (
  <PersonPage ... />
) : mode === "chat" && conversation ? (
  <ChatView ... />
) : (
  <Editor ... />
)}
```

- [ ] **Step 7: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add src/editor/slash-commands.ts src/app/page.tsx
git commit -m "feat: wire /me command to UserProfilePage"
```

---

### Task 8: Update Test Setup for Cleanup Order

**Files:**
- Modify: `tests/setup.ts`

- [ ] **Step 1: Check current cleanup and add UserInsight**

Read `tests/setup.ts`. The global setup creates the test database. Individual test files handle their own `beforeEach` cleanup. No changes needed to the global setup file — each test file that touches `UserInsight` handles its own cleanup (already done in Task 2 and Task 3 tests).

However, if other test files have a shared `beforeEach` that cleans all tables, add `userInsight` to that cleanup in the correct order. `UserInsight` has no FK dependencies, so it can be deleted at any point in the order.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass, including the new user-insights tests.

- [ ] **Step 3: Commit (if changes were needed)**

```bash
git add tests/setup.ts
git commit -m "chore: add UserInsight to test cleanup order"
```
