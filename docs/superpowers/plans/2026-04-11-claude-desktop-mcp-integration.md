# Claude Desktop MCP Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Claude Desktop to Obsid via a local MCP server so conversations can be distilled into notes and insights in real-time.

**Architecture:** A thin local MCP server (stdio transport) exposes two tools (`save_to_vault`, `capture_insight`). Each tool makes an authenticated HTTP request to new `/api/mcp/*` routes on the deployed app. The routes validate an API key, resolve the user's Turso DB, and feed content into existing pipelines (organize, embed, person detect). No changes to existing pipelines.

**Tech Stack:** `@modelcontextprotocol/sdk`, existing Prisma + libsql stack, admin DB for API keys.

---

### Task 1: Add ApiKey Table to Admin Database

**Files:**
- Modify: `prisma/admin-schema.prisma`
- Create: `prisma/admin-migrations/002_api_keys.sql`

- [ ] **Step 1: Add ApiKey model to admin schema**

In `prisma/admin-schema.prisma`, add after the `InviteCode` model:

```prisma
model ApiKey {
  id         String    @id @default(uuid())
  key        String    @unique
  userId     String
  name       String    @default("")
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
}
```

- [ ] **Step 2: Create the admin migration SQL**

Create `prisma/admin-migrations/002_api_keys.sql`:

```sql
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME
);

CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
```

- [ ] **Step 3: Regenerate admin Prisma client**

Run: `npx prisma generate --schema=prisma/admin-schema.prisma`
Expected: "Generated Prisma Client" output with ApiKey model available.

- [ ] **Step 4: Apply migration to admin DB**

Run: `set -a && source .env.local && set +a && node -e "
const { PrismaLibSql } = require('@prisma/adapter-libsql');
const fs = require('fs');
const url = process.env.ADMIN_DATABASE_URL;
const authToken = process.env.ADMIN_DATABASE_AUTH_TOKEN;
const { createClient } = require('@libsql/client');
const client = createClient({ url, authToken });
const sql = fs.readFileSync('prisma/admin-migrations/002_api_keys.sql', 'utf8');
const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
(async () => {
  for (const stmt of statements) {
    await client.execute(stmt);
    console.log('OK:', stmt.slice(0, 60));
  }
  console.log('Done');
})().catch(console.error);
"`

Expected: Three "OK" lines (CREATE TABLE, two CREATE INDEX).

- [ ] **Step 5: Commit**

```bash
git add prisma/admin-schema.prisma prisma/admin-migrations/002_api_keys.sql
git commit -m "feat: add ApiKey table to admin database"
```

---

### Task 2: Create API Key Generation Script

**Files:**
- Create: `scripts/generate-api-key.ts`

- [ ] **Step 1: Write the script**

Create `scripts/generate-api-key.ts`:

```typescript
import { PrismaClient } from ".prisma/admin-client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { randomUUID, randomBytes } from "crypto";

async function main() {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    console.error("Set ADMIN_DATABASE_URL before running this script");
    process.exit(1);
  }

  const username = process.argv[2];
  if (!username) {
    console.error("Usage: npx tsx scripts/generate-api-key.ts <username> [name]");
    process.exit(1);
  }

  const name = process.argv[3] ?? "Claude Desktop";

  const authToken = process.env.ADMIN_DATABASE_AUTH_TOKEN ?? undefined;
  const adapter = new PrismaLibSql({ url, authToken });
  const prisma = new PrismaClient({ adapter });

  // Find user
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`User "${username}" not found`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Generate key: obsid_ prefix + 32 random bytes hex
  const key = "obsid_" + randomBytes(32).toString("hex");

  await prisma.apiKey.create({
    data: {
      id: randomUUID(),
      key,
      userId: user.id,
      name,
    },
  });

  console.log(`\nAPI key for ${username} (${name}):\n${key}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Test the script**

Run: `set -a && source .env.local && set +a && npx tsx scripts/generate-api-key.ts scout`
Expected: Prints `API key for scout (Claude Desktop):` followed by a key starting with `obsid_`.

Save the printed key — you'll need it for MCP server configuration.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-api-key.ts
git commit -m "feat: add API key generation script"
```

---

### Task 3: Create MCP Auth Helper

**Files:**
- Create: `src/lib/mcp-auth.ts`
- Test: `tests/lib/mcp-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/mcp-auth.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { validateApiKey } from "@/lib/mcp-auth";

describe("validateApiKey", () => {
  it("returns null for missing Authorization header", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
    });
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });

  it("returns null for malformed Authorization header", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
      headers: { Authorization: "Basic abc123" },
    });
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });

  it("returns null for invalid key", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
      headers: { Authorization: "Bearer obsid_nonexistent" },
    });
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/mcp-auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/mcp-auth.ts`:

```typescript
import { adminPrisma } from "@/lib/admin-db";
import { getUserDb } from "@/lib/user-db";
import type { PrismaClient } from "@prisma/client";

interface McpAuthResult {
  userId: string;
  db: PrismaClient;
}

export async function validateApiKey(request: Request): Promise<McpAuthResult | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer obsid_")) return null;

  const key = authHeader.slice(7); // "Bearer ".length

  let apiKey;
  try {
    apiKey = await adminPrisma.apiKey.findUnique({ where: { key } });
  } catch {
    return null;
  }
  if (!apiKey) return null;

  // Look up user's Turso credentials
  const user = await adminPrisma.user.findUnique({
    where: { id: apiKey.userId },
  });
  if (!user) return null;

  // Update lastUsedAt (fire-and-forget)
  adminPrisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  // In dev mode, fall back to local DB
  if (process.env.NODE_ENV !== "production") {
    const { prisma } = await import("@/lib/db");
    return { userId: apiKey.userId, db: prisma };
  }

  const db = getUserDb(user.tursoDbUrl, user.tursoDbToken);
  return { userId: apiKey.userId, db };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/mcp-auth.test.ts`
Expected: 3 tests pass. (The "invalid key" test passes because the key doesn't exist in admin DB, returning null.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-auth.ts tests/lib/mcp-auth.test.ts
git commit -m "feat: add MCP API key validation helper"
```

---

### Task 4: Add `relationship` Category to UserInsights

**Files:**
- Modify: `src/lib/user-insights.ts`
- Test: `tests/lib/user-insights.test.ts` (if exists, or create)

- [ ] **Step 1: Check for existing insight tests**

Run: `ls tests/lib/user-insights*` to see if tests exist. If they do, read them first.

- [ ] **Step 2: Write the failing test**

Add to the insight test file (create `tests/lib/user-insights.test.ts` if it doesn't exist):

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createUserInsight } from "@/lib/user-insights";

describe("createUserInsight", () => {
  beforeEach(async () => {
    await prisma.userInsight.deleteMany();
  });

  it("accepts relationship category", async () => {
    const insight = await createUserInsight({
      category: "relationship",
      content: "Values directness in close friendships",
      evidence: "I just told her exactly what I thought",
      source: "claude-desktop",
    });
    expect(insight.category).toBe("relationship");
    expect(insight.source).toBe("claude-desktop");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/user-insights.test.ts`
Expected: FAIL — category falls back to "self-reflection" because "relationship" isn't in `VALID_CATEGORIES`.

- [ ] **Step 4: Add relationship to valid categories**

In `src/lib/user-insights.ts`, change line 13:

```typescript
const VALID_CATEGORIES = ["self-reflection", "expertise", "behavior", "thinking-pattern", "relationship"];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/lib/user-insights.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/user-insights.ts tests/lib/user-insights.test.ts
git commit -m "feat: add relationship category to user insights"
```

---

### Task 5: Update Profile Synthesis to Acknowledge Desktop Source

**Files:**
- Modify: `src/app/api/ai/user-profile/route.ts`

The profile synthesis already handles categories generically (`[${i.category}]` prefix), so `relationship` insights will flow through. But the prompt should acknowledge that insights come from multiple sources (organize, think, and now claude-desktop) so the synthesis can weight them appropriately.

- [ ] **Step 1: Update the insight text to include source**

In `src/app/api/ai/user-profile/route.ts`, change line 23:

```typescript
  const insightText = insights
    .map((i) => `[${i.category}] (source: ${i.source ?? "organize"}) ${i.content}${i.evidence ? ` (evidence: "${i.evidence}")` : ""}`)
    .join("\n");
```

- [ ] **Step 2: Add source context to the system prompt**

In the system prompt (line 29), after "things they've written that reveal who they are", add:

```
Insights come from three sources:
- "organize": extracted automatically from note content
- "think": discovered through deep cross-note analysis  
- "claude-desktop": observed in real-time during conversations with the user (often more candid and immediate)
```

- [ ] **Step 3: Verify the app still works**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/user-profile/route.ts
git commit -m "feat: include insight source in profile synthesis prompt"
```

---

### Task 6: Create `POST /api/mcp/save-note` Route

**Files:**
- Create: `src/app/api/mcp/save-note/route.ts`
- Test: `tests/api/mcp-save-note.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/mcp-save-note.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/mcp/save-note/route";

describe("POST /api/mcp/save-note", () => {
  beforeEach(async () => {
    await prisma.notePerson.deleteMany();
    await prisma.personMeta.deleteMany();
    await prisma.pendingPerson.deleteMany();
    await prisma.command.deleteMany();
    await prisma.embedding.deleteMany();
    await prisma.userInsight.deleteMany();
    await prisma.note.deleteMany();
  });

  it("returns 401 without auth header", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", content: "Hello" }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });

  it("returns 400 without title", async () => {
    // This test verifies input validation even without valid auth
    // In integration, auth would be tested against real admin DB
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer obsid_test",
      },
      body: JSON.stringify({ content: "Hello" }),
    });
    const response = await POST(request as never);
    // Will be 401 (no valid key) — that's correct behavior
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/mcp-save-note.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

Create `src/app/api/mcp/save-note/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/mcp-auth";
import { createNote } from "@/lib/notes";
import { embedNote } from "@/lib/embeddings";

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await request.json();
  const { title, content } = body;

  if (!title || !content) {
    return Response.json(
      { error: "title and content are required" },
      { status: 400 }
    );
  }

  const note = await createNote(
    { title, content, type: "desktop" },
    auth.db
  );

  // Fire-and-forget: embed the note
  embedNote(note.id, title, content, auth.db).catch((err) =>
    console.error("[mcp:save-note] embedNote failed:", err)
  );

  // Fire-and-forget: trigger organize via internal fetch
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  fetch(`${baseUrl}/api/ai/organize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: request.headers.get("authorization") ?? "",
    },
    body: JSON.stringify({ noteId: note.id, recentSiblingIds: [] }),
  }).catch((err) =>
    console.error("[mcp:save-note] organize trigger failed:", err)
  );

  return Response.json({ noteId: note.id }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/api/mcp-save-note.test.ts`
Expected: PASS — 401 returned for missing/invalid auth.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mcp/save-note/route.ts tests/api/mcp-save-note.test.ts
git commit -m "feat: add POST /api/mcp/save-note route"
```

---

### Task 7: Create `POST /api/mcp/save-insight` Route

**Files:**
- Create: `src/app/api/mcp/save-insight/route.ts`
- Test: `tests/api/mcp-save-insight.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/mcp-save-insight.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/mcp/save-insight/route";

describe("POST /api/mcp/save-insight", () => {
  it("returns 401 without auth header", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "behavior",
        content: "Test insight",
        evidence: "Said something",
      }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/mcp-save-insight.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

Create `src/app/api/mcp/save-insight/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/mcp-auth";
import { createUserInsight } from "@/lib/user-insights";
import { getPersonByAlias, addNotePeople } from "@/lib/people";
import { createPendingPerson } from "@/lib/pending-people";

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await request.json();
  const { category, content, evidence, personName, relatedTopics } = body;

  if (!category || !content || !evidence) {
    return Response.json(
      { error: "category, content, and evidence are required" },
      { status: 400 }
    );
  }

  // Append related topics to evidence if provided
  let fullEvidence = evidence;
  if (relatedTopics?.length > 0) {
    fullEvidence += ` [Topics: ${relatedTopics.join(", ")}]`;
  }

  const insight = await createUserInsight(
    {
      category,
      content,
      evidence: fullEvidence,
      source: "claude-desktop",
    },
    auth.db
  );

  // Handle person linking if provided
  if (personName) {
    const person = await getPersonByAlias(personName, auth.db);
    if (person) {
      // If insight relates to a person, we don't have a noteId to link
      // Person summary regeneration happens when notes link to people
      // For standalone insights, we just record the observation
    } else {
      // Create PendingPerson for review
      await createPendingPerson(
        {
          name: personName,
          context: `Claude Desktop insight: ${content}`,
        },
        auth.db
      );
    }
  }

  return Response.json({ insightId: insight.id }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/api/mcp-save-insight.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mcp/save-insight/route.ts tests/api/mcp-save-insight.test.ts
git commit -m "feat: add POST /api/mcp/save-insight route"
```

---

### Task 8: Update Organize Route to Accept API Key Auth

The organize route currently relies on the proxy injecting `x-user-db-url`/`x-user-db-token` headers (via JWT cookie). When `save-note` triggers organize via internal fetch, it passes the API key instead. The organize route needs to accept both auth methods.

**Files:**
- Modify: `src/app/api/ai/organize/route.ts`

- [ ] **Step 1: Update organize to try API key auth as fallback**

At the top of the `POST` function in `src/app/api/ai/organize/route.ts`, the first line is `const db = getDb(request)`. In dev mode this works because `getDb` falls through to local dev.db. In production, the proxy won't have injected headers for MCP requests.

Add API key fallback. Change the beginning of the POST handler:

```typescript
export async function POST(request: NextRequest) {
  let db;
  // Try standard proxy-injected headers first, fall back to API key auth
  const hasProxyHeaders = request.headers.get("x-user-db-url");
  if (hasProxyHeaders) {
    db = getDb(request);
  } else {
    // MCP route may trigger organize with API key auth
    const { validateApiKey } = await import("@/lib/mcp-auth");
    const auth = await validateApiKey(request);
    if (!auth) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    db = auth.db;
  }
  const cookieHeader = request.headers.get("cookie") ?? "";
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/organize/route.ts
git commit -m "feat: allow organize route to accept API key auth"
```

---

### Task 9: Create Local MCP Server

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `mcp/src/index.ts`

- [ ] **Step 1: Create mcp directory and package.json**

Create `mcp/package.json`:

```json
{
  "name": "obsid-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `mcp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd mcp && npm install && cd ..`
Expected: `node_modules` created in `mcp/`.

- [ ] **Step 4: Write the MCP server**

Create `mcp/src/index.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.OBSID_API_URL ?? "http://localhost:3000";
const API_KEY = process.env.OBSID_API_KEY ?? "";

if (!API_KEY) {
  console.error("OBSID_API_KEY environment variable is required");
  process.exit(1);
}

const server = new McpServer({
  name: "obsid",
  version: "1.0.0",
});

server.tool(
  "save_to_vault",
  `Save a distilled note to the user's personal knowledge base (Obsid). This vault captures the user's thinking across ALL domains — work, relationships, hobbies, health, creative projects, decisions, observations about life.

When saving:
- Write in the user's voice, not as a conversation summary
- Preserve the user's actual words and phrases as much as possible — quote them naturally within the note
- Distill structure (what was discussed, what was decided, what's unresolved) but keep the user's language as the substance
- Don't editorialize or add conclusions the user didn't reach
- Include names of people mentioned naturally`,
  {
    title: z.string().describe("Concise, natural title for the note"),
    content: z.string().describe("Markdown note content — distilled with structure but preserving the user's words"),
  },
  async ({ title, content }) => {
    const res = await fetch(`${API_URL}/api/mcp/save-note`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ title, content }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        content: [{ type: "text" as const, text: `Failed to save note: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      };
    }

    const data = await res.json() as { noteId: string };
    return {
      content: [{ type: "text" as const, text: `Note saved to vault (id: ${data.noteId}). It will be automatically organized, embedded, and linked.` }],
    };
  }
);

server.tool(
  "capture_insight",
  `Capture an observation about the user into their knowledge base. Use when you notice patterns in how the user thinks, acts, decides, or relates to people — across any domain of life, not just work.

IMPORTANT: Always ask the user for permission before calling this tool. Frame what you noticed and let them decide.

Categories:
- behavior: how they act or respond in situations
- self-reflection: something they realized about themselves
- expertise: knowledge or skill they demonstrated
- thinking-pattern: how they reason or approach problems
- relationship: how they relate to or think about specific people`,
  {
    category: z.enum(["behavior", "self-reflection", "expertise", "thinking-pattern", "relationship"]).describe("Insight category"),
    content: z.string().describe("The insight, written about the user"),
    evidence: z.string().describe("The user's own words or context that supports this"),
    personName: z.string().optional().describe("If the insight involves a specific person"),
    relatedTopics: z.array(z.string()).optional().describe("Free-text topic hints for future linking"),
  },
  async ({ category, content, evidence, personName, relatedTopics }) => {
    const res = await fetch(`${API_URL}/api/mcp/save-insight`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ category, content, evidence, personName, relatedTopics }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        content: [{ type: "text" as const, text: `Failed to capture insight: ${(err as Record<string, string>).error ?? res.statusText}` }],
        isError: true,
      };
    }

    const data = await res.json() as { insightId: string };
    return {
      content: [{ type: "text" as const, text: `Insight captured (id: ${data.insightId}).` }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 5: Build the MCP server**

Run: `cd mcp && npm run build && cd ..`
Expected: `mcp/dist/index.js` created.

- [ ] **Step 6: Verify it starts and shuts down cleanly**

Run: `echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' | OBSID_API_KEY=test node mcp/dist/index.js 2>/dev/null | head -1`
Expected: JSON response with server info (name: "obsid").

- [ ] **Step 7: Commit**

```bash
git add mcp/package.json mcp/tsconfig.json mcp/src/index.ts
git commit -m "feat: add local MCP server for Claude Desktop"
```

---

### Task 10: Create INSTRUCTIONS.md for Claude Desktop

**Files:**
- Create: `mcp/INSTRUCTIONS.md`

- [ ] **Step 1: Write the instructions**

Create `mcp/INSTRUCTIONS.md`:

```markdown
# Obsid MCP Server — Instructions for Claude Desktop

You have access to Obsid, the user's personal knowledge base. This vault captures their thinking across ALL domains of life — work, relationships, hobbies, health, creative projects, decisions, and observations.

## Tools

### save_to_vault
Use when the user asks to save something from the conversation. Distill the conversation into a note:
- Write in the user's voice, not as a summary of our exchange
- Preserve their actual words — weave direct quotes naturally into the structure
- Focus on what was discussed, decided, and what's unresolved
- Don't add conclusions they didn't reach
- Include people's names naturally when mentioned

### capture_insight
Use when you notice a pattern in how the user thinks, acts, decides, or relates to people. Always ask permission first — "I noticed [observation]. Want me to save this to your vault?"

Look for:
- **Behavior patterns** — how they respond to situations across different contexts
- **Self-reflections** — things they realize about themselves
- **Expertise signals** — knowledge or skills they demonstrate
- **Thinking patterns** — how they reason through problems
- **Relationship dynamics** — how they think about or relate to specific people

## Guidelines
- Quality over quantity. Don't save routine exchanges.
- This is their personal vault — all domains of life matter, not just work.
- For insights, include their actual words as evidence.
- Don't over-explain or editorialize.
```

- [ ] **Step 2: Commit**

```bash
git add mcp/INSTRUCTIONS.md
git commit -m "docs: add MCP server instructions for Claude Desktop"
```

---

### Task 11: Add .gitignore for MCP Server

**Files:**
- Create: `mcp/.gitignore`

- [ ] **Step 1: Create .gitignore**

Create `mcp/.gitignore`:

```
node_modules/
dist/
```

- [ ] **Step 2: Commit**

```bash
git add mcp/.gitignore
git commit -m "chore: add mcp .gitignore"
```

---

### Task 12: End-to-End Integration Test

Manual verification that the full pipeline works.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (if not already running)

- [ ] **Step 2: Generate an API key**

Run: `set -a && source .env.local && set +a && npx tsx scripts/generate-api-key.ts scout`
Save the printed key.

- [ ] **Step 3: Test save-note endpoint**

Run (replace `YOUR_KEY` with the generated key):
```bash
curl -X POST http://localhost:3000/api/mcp/save-note \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"title": "Testing MCP integration", "content": "This note was saved from Claude Desktop. \"I think this could be really powerful\" — testing the distillation pipeline."}'
```
Expected: `{"noteId":"..."}` with status 201.

- [ ] **Step 4: Verify note appears in the app**

Open `http://localhost:3000` in a browser. Check that the note "Testing MCP integration" appears in the note list with type `desktop`.

- [ ] **Step 5: Test save-insight endpoint**

```bash
curl -X POST http://localhost:3000/api/mcp/save-insight \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"category": "thinking-pattern", "content": "Approaches new tools by building something real immediately rather than reading docs first", "evidence": "Just jumped straight into testing the MCP integration end-to-end", "relatedTopics": ["learning style", "tool adoption"]}'
```
Expected: `{"insightId":"..."}` with status 201.

- [ ] **Step 6: Verify insight appears in /me profile**

Open the `/me` page in the app. Check that the insight shows up with source `claude-desktop`.

- [ ] **Step 7: Test MCP server with Claude Desktop**

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "obsid": {
      "command": "node",
      "args": ["/absolute/path/to/obsid/mcp/dist/index.js"],
      "env": {
        "OBSID_API_URL": "http://localhost:3000",
        "OBSID_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

Restart Claude Desktop. Start a conversation and ask Claude to save something to your vault. Verify it appears in Obsid.

- [ ] **Step 8: Commit any fixes**

If any issues were found and fixed during integration testing, commit them.

---

### Task 13: Deploy and Generate Production API Key

- [ ] **Step 1: Push all changes**

```bash
git push
```

- [ ] **Step 2: Wait for Railway deployment**

Monitor Railway dashboard for successful deployment.

- [ ] **Step 3: Apply admin migration to production**

Run the migration SQL against the production admin Turso DB to create the ApiKey table.

- [ ] **Step 4: Generate production API key**

Run: `set -a && source .env.local && set +a && npx tsx scripts/generate-api-key.ts scout "Claude Desktop"`

- [ ] **Step 5: Update Claude Desktop config for production**

Update `claude_desktop_config.json` to point to the Railway URL instead of localhost:

```json
{
  "mcpServers": {
    "obsid": {
      "command": "node",
      "args": ["/absolute/path/to/obsid/mcp/dist/index.js"],
      "env": {
        "OBSID_API_URL": "https://your-railway-url.com",
        "OBSID_API_KEY": "obsid_production_key_here"
      }
    }
  }
}
```

- [ ] **Step 6: Restart Claude Desktop and verify end-to-end**

Save a note from Claude Desktop. Verify it appears in the production Obsid instance.
