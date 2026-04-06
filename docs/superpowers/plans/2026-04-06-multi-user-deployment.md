# Multi-User Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Obsid as a multi-user app on Turso + Vercel with invite-code signup and per-user database isolation.

**Architecture:** Two-tier database model — one shared admin Turso DB (users, invite codes) and one Turso DB per user (same schema as today). Auth via username/password with JWT cookies. Next.js 16 proxy (`proxy.ts`) handles auth checks and injects per-user DB credentials into request headers. Existing lib files stay untouched via a request-context pattern.

**Tech Stack:** Turso (hosted libsql), Vercel, bcrypt (password hashing), jose (JWT), Next.js 16 proxy

**Spec:** `docs/superpowers/specs/2026-04-06-multi-user-deployment-design.md`

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install bcrypt and jose**

```bash
npm install bcryptjs jose
npm install -D @types/bcryptjs
```

`bcryptjs` is the pure-JS bcrypt (no native compilation, works on Vercel). `jose` is a lightweight JWT library that works in all runtimes.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add bcryptjs and jose for auth"
```

---

### Task 2: Admin database schema and client

**Files:**
- Create: `prisma/admin-schema.prisma`
- Create: `prisma/admin-migrations/001_init.sql`
- Create: `src/lib/admin-db.ts`

- [ ] **Step 1: Create the admin Prisma schema**

Create `prisma/admin-schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/.prisma/admin-client"
}

datasource db {
  provider = "sqlite"
}

model User {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String
  tursoDbUrl   String
  tursoDbToken String
  createdAt    DateTime @default(now())
}

model InviteCode {
  id        String    @id @default(uuid())
  code      String    @unique
  usedBy    String?
  createdAt DateTime  @default(now())
  usedAt    DateTime?
}
```

- [ ] **Step 2: Create the admin migration SQL**

Create `prisma/admin-migrations/001_init.sql`:

```sql
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tursoDbUrl" TEXT NOT NULL,
    "tursoDbToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "usedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME
);

CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");
```

- [ ] **Step 3: Create the admin DB client**

Create `src/lib/admin-db.ts`:

```typescript
import { PrismaClient } from ".prisma/admin-client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createAdminClient() {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) throw new Error("ADMIN_DATABASE_URL not set");
  const authToken = process.env.ADMIN_DATABASE_AUTH_TOKEN ?? undefined;
  const adapter = new PrismaLibSql({ url, authToken });
  return new PrismaClient({ adapter });
}

const globalForAdmin = globalThis as unknown as {
  adminPrisma: PrismaClient | undefined;
};

export const adminPrisma =
  globalForAdmin.adminPrisma ?? createAdminClient();

if (process.env.NODE_ENV !== "production")
  globalForAdmin.adminPrisma = adminPrisma;
```

- [ ] **Step 4: Generate the admin Prisma client**

```bash
npx prisma generate --schema=prisma/admin-schema.prisma
```

- [ ] **Step 5: Commit**

```bash
git add prisma/admin-schema.prisma prisma/admin-migrations/ src/lib/admin-db.ts
git commit -m "feat: admin database schema and client for users + invite codes"
```

---

### Task 3: Auth utilities (password hashing + JWT)

**Files:**
- Create: `src/lib/auth.ts`
- Create: `tests/lib/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/auth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, createToken, verifyToken } from "@/lib/auth";

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("testpass123");
    expect(hash).not.toBe("testpass123");
    expect(await verifyPassword("testpass123", hash)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("testpass123");
    expect(await verifyPassword("wrongpass", hash)).toBe(false);
  });
});

describe("JWT", () => {
  it("creates and verifies a token", async () => {
    const token = await createToken({ sub: "user-123", username: "alice" });
    expect(typeof token).toBe("string");

    const payload = await verifyToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.username).toBe("alice");
  });

  it("rejects a tampered token", async () => {
    const token = await createToken({ sub: "user-123", username: "alice" });
    const tampered = token.slice(0, -5) + "XXXXX";
    await expect(verifyToken(tampered)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/lib/auth.test.ts
```

Expected: FAIL — `auth` module doesn't exist yet.

- [ ] **Step 3: Implement auth utilities**

Create `src/lib/auth.ts`:

```typescript
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const SALT_ROUNDS = 10;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: {
  sub: string;
  username: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifyToken(
  token: string
): Promise<{ sub: string; username: string }> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as { sub: string; username: string };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Set a test JWT_SECRET in the test environment. Add to `vitest.config.ts` env or set inline:

```bash
JWT_SECRET=test-secret-at-least-32-chars-long npm test -- tests/lib/auth.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts tests/lib/auth.test.ts
git commit -m "feat: auth utilities — bcrypt password hashing + JWT sign/verify"
```

---

### Task 4: Per-user database client with LRU cache

**Files:**
- Create: `src/lib/user-db.ts`
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Create the user DB client factory**

Create `src/lib/user-db.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const MAX_CACHED_CLIENTS = 50;

const clientCache = new Map<
  string,
  { client: PrismaClient; lastUsed: number }
>();

export function getUserDb(url: string, authToken: string): PrismaClient {
  const existing = clientCache.get(url);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.client;
  }

  // Evict oldest if at capacity
  if (clientCache.size >= MAX_CACHED_CLIENTS) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, entry] of clientCache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      clientCache.get(oldestKey)?.client.$disconnect();
      clientCache.delete(oldestKey);
    }
  }

  const adapter = new PrismaLibSql({ url, authToken });
  const client = new PrismaClient({ adapter });
  clientCache.set(url, { client, lastUsed: Date.now() });
  return client;
}
```

- [ ] **Step 2: Update `src/lib/db.ts` to support request-scoped routing**

Replace the contents of `src/lib/db.ts` with:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { getUserDb } from "./user-db";

// Local dev singleton
function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const localPrisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = localPrisma;

/**
 * Request-scoped DB access. In production, reads user DB credentials
 * from headers injected by proxy.ts. In dev, returns the local singleton.
 */
export function getDb(request?: Request): PrismaClient {
  if (request) {
    const url = request.headers.get("x-user-db-url");
    const token = request.headers.get("x-user-db-token");
    if (url && token) {
      return getUserDb(url, token);
    }
  }
  return localPrisma;
}

// Backwards-compatible export for lib files that import { prisma }
// In production, this returns the local client (unused — API routes use getDb()).
// In dev, this is the working client.
export const prisma = localPrisma;
```

This preserves the `import { prisma }` pattern for the 8 lib files in dev. In production, API routes will call `getDb(request)` which returns the per-user client.

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
npm test
```

Expected: All existing tests PASS (the `prisma` export still works as before).

- [ ] **Step 4: Commit**

```bash
git add src/lib/user-db.ts src/lib/db.ts
git commit -m "feat: per-user DB client with LRU cache + request-scoped getDb()"
```

---

### Task 5: Update API routes to use `getDb(request)`

This is the largest mechanical change. Every API route that touches the database needs to call `getDb(request)` and pass the resulting client to lib functions. Since the lib files import `prisma` directly, we need to change the approach slightly: **API routes that call lib functions indirectly through `prisma`** work because `prisma` is the dev singleton. For production, we need to thread the client through.

The cleanest approach: modify the lib files to accept an optional `db` parameter, defaulting to the global `prisma`. This way existing tests and dev mode work unchanged, and API routes can pass the per-user client in production.

**Files:**
- Modify: `src/lib/notes.ts`
- Modify: `src/lib/collections.ts`
- Modify: `src/lib/tags.ts`
- Modify: `src/lib/people.ts`
- Modify: `src/lib/commands.ts`
- Modify: `src/lib/conversations.ts`
- Modify: `src/lib/pending-people.ts`
- Modify: `src/lib/embeddings.ts`
- Modify: `src/lib/ai-tools.ts`
- Modify: All 16 API route files

- [ ] **Step 1: Add `db` parameter to `src/lib/notes.ts`**

At the top of the file, change:
```typescript
import { prisma } from "@/lib/db";
```
to:
```typescript
import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
```

Then add `db: PrismaClient = defaultPrisma` as the last parameter to every exported function. For example:

```typescript
export async function createNote(input: CreateNoteInput, db: PrismaClient = defaultPrisma): Promise<Note> {
  const raw = await db.note.create({ ... });
  // rest unchanged
}

export async function getNote(id: string, db: PrismaClient = defaultPrisma): Promise<Note | null> {
  const raw = await db.note.findUnique({ ... });
  // rest unchanged
}
```

Do this for ALL exported functions in the file: `createNote`, `getNote`, `updateNote`, `conditionalUpdateNote`, `deleteNote`, `listNotes`, `listContextNotes`, `searchNotes`, `getRecentNotes`.

For functions that use raw SQL (`conditionalUpdateNote`, `listNotes`, `listContextNotes`, `searchNotes`), replace `prisma.$queryRawUnsafe(...)` with `db.$queryRawUnsafe(...)`.

- [ ] **Step 2: Add `db` parameter to `src/lib/collections.ts`**

Same pattern. Change import, add `db: PrismaClient = defaultPrisma` to: `createCollection`, `getCollection`, `listCollections`, `deleteCollection`.

- [ ] **Step 3: Add `db` parameter to `src/lib/tags.ts`**

Same pattern for `getTagVocabulary`.

- [ ] **Step 4: Add `db` parameter to `src/lib/people.ts`**

Same pattern for: `createPerson`, `getPerson`, `getPersonByAlias`, `listPeople`, `updatePerson`, `addNotePerson`, `getNotePeople`, `getNotesMentioning`, `updatePersonSummary`.

- [ ] **Step 5: Add `db` parameter to `src/lib/commands.ts`**

Same pattern for: `createCommand`, `updateCommand`, `getCommandsForNote`, `deleteCommandsForNote`.

- [ ] **Step 6: Add `db` parameter to `src/lib/conversations.ts`**

Same pattern for: `createConversation`, `getConversation`, `getMostRecentConversation`, `updateConversationTitle`, `addMessage`, `getMessages`.

- [ ] **Step 7: Add `db` parameter to `src/lib/pending-people.ts`**

Same pattern for: `createPendingPerson`, `listPendingPeople`, `updatePendingPersonStatus`, `dismissPendingPerson`.

- [ ] **Step 8: Add `db` parameter to `src/lib/embeddings.ts`**

Same pattern for: `embedNote`, `semanticSearch`.

- [ ] **Step 9: Update `src/lib/ai-tools.ts`**

Add a `db` parameter to `executeTool` and pass it through to the lib functions it calls:

```typescript
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  meta?: { noteId?: string },
  db: PrismaClient = defaultPrisma
) {
  switch (name) {
    case "semantic_search":
      return await semanticSearch(input.query as string, input.limit as number, db);
    case "read_note":
      return await getNote(input.note_id as string, db);
    // ... pass db to all lib calls
  }
}
```

- [ ] **Step 10: Update all API routes to pass `getDb(request)` to lib functions**

For each API route file, add `import { getDb } from "@/lib/db"` and pass `getDb(request)` as the `db` argument to every lib function call. Example for `src/app/api/notes/[id]/route.ts`:

```typescript
import { getDb } from "@/lib/db";
import { getNote, updateNote, deleteNote } from "@/lib/notes";
import { deleteCommandsForNote } from "@/lib/commands";
import { embedNote } from "@/lib/embeddings";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb(request);
  const note = await getNote(id, db);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  return NextResponse.json(note);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const db = getDb(request);
  const note = await updateNote(id, body, db);
  embedNote(note.id, note.title, note.content, db).catch((err) =>
    console.error("[embed] Background embed failed:", err)
  );
  return NextResponse.json(note);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb(request);
  await deleteCommandsForNote(id, db);
  await db.embedding.deleteMany({ where: { noteId: id } });
  await db.notePerson.deleteMany({ where: { noteId: id } });
  await db.pendingPerson.updateMany({
    where: { sourceNoteId: id },
    data: { sourceNoteId: null },
  });
  await deleteNote(id, db);
  return NextResponse.json({ success: true });
}
```

Apply the same pattern to these API route files (all need `const db = getDb(request)` and passing `db` to lib calls):

- `src/app/api/notes/route.ts`
- `src/app/api/notes/[id]/route.ts`
- `src/app/api/notes/[id]/commands/route.ts`
- `src/app/api/collections/route.ts`
- `src/app/api/collections/[id]/route.ts`
- `src/app/api/tags/route.ts`
- `src/app/api/people/route.ts` — also replace direct `prisma.*` calls with `db.*`
- `src/app/api/people/[id]/route.ts` — also replace direct `prisma.*` calls with `db.*`
- `src/app/api/people/create/route.ts`
- `src/app/api/pending-people/route.ts`
- `src/app/api/conversations/route.ts`
- `src/app/api/conversations/[id]/messages/route.ts`
- `src/app/api/search/route.ts`
- `src/app/api/ai/route.ts`
- `src/app/api/ai/chat/route.ts`
- `src/app/api/ai/command/route.ts`
- `src/app/api/ai/organize/route.ts`
- `src/app/api/ai/person-summary/route.ts`

For the AI routes that call `executeTool`, pass `db` through:
```typescript
const db = getDb(request);
const result = await executeTool(toolName, toolInput, meta, db);
```

For routes that do internal `fetch()` calls to other API routes (organize and ai-tools call `/api/ai/person-summary`), the fetch goes through the proxy again and gets fresh headers, so no change needed there.

- [ ] **Step 11: Run all existing tests**

```bash
npm test
```

Expected: All tests PASS. The default `db` parameter means existing test code (which doesn't pass `db`) still works with the dev singleton.

- [ ] **Step 12: Commit**

```bash
git add src/lib/ src/app/api/
git commit -m "feat: thread per-user DB client through lib layer and API routes"
```

---

### Task 6: Auth API routes (signup + login)

**Files:**
- Create: `src/app/api/auth/signup/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `scripts/provision-user-db.ts`

- [ ] **Step 1: Create the user DB provisioning script**

Create `scripts/provision-user-db.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

/**
 * Provisions a new Turso database for a user:
 * 1. Creates the database via Turso Platform API
 * 2. Runs all Prisma migrations
 * 3. Sets up FTS5
 * Returns { url, authToken }
 */
export async function provisionUserDb(username: string): Promise<{
  url: string;
  authToken: string;
}> {
  const tursoToken = process.env.TURSO_API_TOKEN;
  const tursoOrg = process.env.TURSO_ORG;
  if (!tursoToken || !tursoOrg)
    throw new Error("TURSO_API_TOKEN and TURSO_ORG must be set");

  const dbName = `obsid-user-${username.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  // Create database via Turso Platform API
  const createRes = await fetch(
    `https://api.turso.tech/v1/organizations/${tursoOrg}/databases`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tursoToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: dbName, group: "default" }),
    }
  );
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Turso DB creation failed: ${err}`);
  }
  const dbInfo = await createRes.json();
  const hostname = dbInfo.database?.hostname ?? `${dbName}-${tursoOrg}.turso.io`;
  const url = `libsql://${hostname}`;

  // Create auth token for this database
  const tokenRes = await fetch(
    `https://api.turso.tech/v1/organizations/${tursoOrg}/databases/${dbName}/auth/tokens`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tursoToken}` },
    }
  );
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Turso token creation failed: ${err}`);
  }
  const tokenData = await tokenRes.json();
  const authToken = tokenData.jwt;

  // Run migrations against the new database
  const adapter = new PrismaLibSql({ url, authToken });
  const prisma = new PrismaClient({ adapter });

  // Apply migrations as raw SQL (same approach as tests/setup.ts)
  const fs = await import("fs");
  const path = await import("path");
  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const entries = fs.readdirSync(migrationsDir).sort();

  for (const entry of entries) {
    const migrationSql = path.join(migrationsDir, entry, "migration.sql");
    if (!fs.existsSync(migrationSql)) continue;
    const sql = fs.readFileSync(migrationSql, "utf-8");
    const statements = sql
      .split(";")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
  }

  // Set up FTS5
  await prisma.$executeRawUnsafe(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      id UNINDEXED, title, content, tags, content='Note', content_rowid='rowid'
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON Note BEGIN
      INSERT INTO notes_fts(id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON Note BEGIN
      DELETE FROM notes_fts WHERE id = old.id;
      INSERT INTO notes_fts(id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON Note BEGIN
      DELETE FROM notes_fts WHERE id = old.id;
    END;
  `);

  await prisma.$disconnect();

  return { url, authToken };
}
```

- [ ] **Step 2: Create signup route**

Create `src/app/api/auth/signup/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { adminPrisma } from "@/lib/admin-db";
import { hashPassword, createToken } from "@/lib/auth";
import { provisionUserDb } from "@/../scripts/provision-user-db";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const { username, password, inviteCode } = await request.json();

  if (!username || !password || !inviteCode) {
    return Response.json(
      { error: "Username, password, and invite code are required" },
      { status: 400 }
    );
  }

  if (username.length < 3 || username.length > 30) {
    return Response.json(
      { error: "Username must be 3-30 characters" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  // Validate invite code
  const code = await adminPrisma.inviteCode.findUnique({
    where: { code: inviteCode },
  });
  if (!code || code.usedBy) {
    return Response.json(
      { error: "Invalid or already used invite code" },
      { status: 400 }
    );
  }

  // Check username availability
  const existingUser = await adminPrisma.user.findUnique({
    where: { username },
  });
  if (existingUser) {
    return Response.json(
      { error: "Username already taken" },
      { status: 400 }
    );
  }

  // Provision user database
  const { url: tursoDbUrl, authToken: tursoDbToken } =
    await provisionUserDb(username);

  // Create user
  const userId = randomUUID();
  const passwordHash = await hashPassword(password);

  await adminPrisma.user.create({
    data: {
      id: userId,
      username,
      passwordHash,
      tursoDbUrl,
      tursoDbToken,
    },
  });

  // Mark invite code as used
  await adminPrisma.inviteCode.update({
    where: { code: inviteCode },
    data: { usedBy: userId, usedAt: new Date() },
  });

  // Issue JWT
  const token = await createToken({ sub: userId, username });

  const response = Response.json({ success: true, username });
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`
  );

  return new Response(response.body, {
    status: 200,
    headers,
  });
}
```

- [ ] **Step 3: Create login route**

Create `src/app/api/auth/login/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { adminPrisma } from "@/lib/admin-db";
import { verifyPassword, createToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return Response.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  const user = await adminPrisma.user.findUnique({
    where: { username },
  });
  if (!user) {
    return Response.json(
      { error: "Invalid username or password" },
      { status: 401 }
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return Response.json(
      { error: "Invalid username or password" },
      { status: 401 }
    );
  }

  const token = await createToken({ sub: user.id, username: user.username });

  const response = Response.json({ success: true, username: user.username });
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`
  );

  return new Response(response.body, {
    status: 200,
    headers,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/provision-user-db.ts src/app/api/auth/
git commit -m "feat: signup + login API routes with Turso DB provisioning"
```

---

### Task 7: Next.js 16 proxy (auth + DB header injection)

Next.js 16 renamed `middleware.ts` to `proxy.ts`. The exported function must be named `proxy`, not `middleware`.

**Files:**
- Create: `src/proxy.ts`

- [ ] **Step 1: Create the proxy**

Create `src/proxy.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { adminPrisma } from "@/lib/admin-db";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  // Check for JWT cookie
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify JWT
  let payload: { sub: string; username: string };
  try {
    payload = await verifyToken(token);
  } catch {
    // Invalid or expired token — clear cookie and redirect
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("token");
    return response;
  }

  // Look up user's DB credentials
  const user = await adminPrisma.user.findUnique({
    where: { id: payload.sub },
  });
  if (!user) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("token");
    return response;
  }

  // Inject DB credentials into request headers for downstream API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-db-url", user.tursoDbUrl);
  requestHeaders.set("x-user-db-token", user.tursoDbToken);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-username", user.username);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Verify the dev server still starts**

```bash
npm run dev
```

Open http://localhost:3000 — you should be redirected to `/login` (which doesn't exist yet, so you'll see a 404). This confirms the proxy is running.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: Next.js 16 proxy — auth check + per-user DB header injection"
```

---

### Task 8: Login and signup pages

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/signup/page.tsx`

- [ ] **Step 1: Create login page**

Create `src/app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Login failed");
      setLoading(false);
      return;
    }

    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 p-8"
      >
        <h1 className="text-2xl font-bold text-neutral-100">Obsid</h1>
        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-neutral-100 text-neutral-900 rounded font-medium hover:bg-neutral-200 disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
        <p className="text-neutral-500 text-sm text-center">
          Have an invite code?{" "}
          <a href="/signup" className="text-neutral-300 hover:underline">
            Sign up
          </a>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create signup page**

Create `src/app/signup/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, inviteCode }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Signup failed");
      setLoading(false);
      return;
    }

    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 p-8"
      >
        <h1 className="text-2xl font-bold text-neutral-100">Join Obsid</h1>
        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
        <input
          type="text"
          placeholder="Invite code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
          autoFocus
        />
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
        />
        <input
          type="password"
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-neutral-100 focus:outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-neutral-100 text-neutral-900 rounded font-medium hover:bg-neutral-200 disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>
        <p className="text-neutral-500 text-sm text-center">
          Already have an account?{" "}
          <a href="/login" className="text-neutral-300 hover:underline">
            Log in
          </a>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/login/ src/app/signup/
git commit -m "feat: login and signup pages"
```

---

### Task 9: Invite code generation script

**Files:**
- Create: `scripts/generate-invite.ts`

- [ ] **Step 1: Create the script**

Create `scripts/generate-invite.ts`:

```typescript
import { PrismaClient } from ".prisma/admin-client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { randomUUID } from "crypto";

async function main() {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    console.error("Set ADMIN_DATABASE_URL before running this script");
    process.exit(1);
  }

  const authToken = process.env.ADMIN_DATABASE_AUTH_TOKEN ?? undefined;
  const adapter = new PrismaLibSql({ url, authToken });
  const prisma = new PrismaClient({ adapter });

  const code = randomUUID().slice(0, 8) + "-" + randomUUID().slice(0, 8);

  await prisma.inviteCode.create({
    data: {
      id: randomUUID(),
      code,
    },
  });

  console.log(`\nInvite code: ${code}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/generate-invite.ts
git commit -m "feat: CLI script to generate invite codes"
```

---

### Task 10: Admin invite code API route

**Files:**
- Create: `src/app/api/admin/invite-codes/route.ts`

- [ ] **Step 1: Create the admin route**

Create `src/app/api/admin/invite-codes/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { adminPrisma } from "@/lib/admin-db";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  // Only allow the admin user
  const username = request.headers.get("x-username");
  if (username !== process.env.ADMIN_USERNAME) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const code =
    randomUUID().slice(0, 8) + "-" + randomUUID().slice(0, 8);

  await adminPrisma.inviteCode.create({
    data: { id: randomUUID(), code },
  });

  return Response.json({ code });
}

export async function GET(request: NextRequest) {
  const username = request.headers.get("x-username");
  if (username !== process.env.ADMIN_USERNAME) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const codes = await adminPrisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
  });

  return Response.json(codes);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/
git commit -m "feat: admin API route for invite code management"
```

---

### Task 11: Logout route

**Files:**
- Create: `src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Create logout route**

Create `src/app/api/auth/logout/route.ts`:

```typescript
export async function POST() {
  const response = Response.json({ success: true });
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    "token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
  );

  return new Response(response.body, { status: 200, headers });
}
```

- [ ] **Step 2: Add `/logout` slash command to the app**

In `src/editor/slash-commands.ts`, add a logout command to the command list:

```typescript
{
  label: "Logout",
  description: "Sign out of Obsid",
  action: "app:logout",
  mode: "both",
}
```

Then handle it in `page.tsx`'s `handleSlashCommand`:

```typescript
case "app:logout":
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
  break;
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/logout/ src/editor/slash-commands.ts src/app/page.tsx
git commit -m "feat: logout route + /logout slash command"
```

---

### Task 12: Update internal fetch calls with base URL

**Files:**
- Modify: `src/lib/ai-tools.ts:176`
- Modify: `src/app/api/ai/organize/route.ts:177`

- [ ] **Step 1: Ensure internal fetch calls use `NEXT_PUBLIC_BASE_URL`**

Both files already use `process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"` — verify this is still correct after the API route changes. The key thing: these internal fetches go through the proxy and get fresh headers, so they work automatically for authenticated users.

However, the fire-and-forget fetches to `/api/ai/person-summary` don't forward the auth cookie. Fix by passing the cookie from the original request:

In `src/app/api/ai/organize/route.ts`, update the fire-and-forget fetch to forward the cookie:

```typescript
const cookieHeader = request.headers.get("cookie") ?? "";
fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/ai/person-summary`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Cookie": cookieHeader,
  },
  body: JSON.stringify({ ... }),
});
```

Apply the same pattern in `src/lib/ai-tools.ts` — the `executeTool` function needs access to the original request's cookie. Add a `cookie` field to the `meta` parameter:

```typescript
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  meta?: { noteId?: string; cookie?: string },
  db: PrismaClient = defaultPrisma
) {
  // ... in the person-summary fetch:
  fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/ai/person-summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(meta?.cookie ? { Cookie: meta.cookie } : {}),
    },
    body: JSON.stringify({ ... }),
  });
}
```

Then in the AI API routes that call `executeTool`, pass the cookie:

```typescript
const cookie = request.headers.get("cookie") ?? "";
const result = await executeTool(toolName, toolInput, { noteId, cookie }, db);
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai-tools.ts src/app/api/ai/
git commit -m "fix: forward auth cookie in internal fire-and-forget fetches"
```

---

### Task 13: Update FTS setup script for remote DBs

**Files:**
- Modify: `prisma/fts-setup.ts`

- [ ] **Step 1: Update the script to accept auth token**

Replace the contents of `prisma/fts-setup.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const authToken = process.env.DATABASE_AUTH_TOKEN ?? undefined;
const adapter = new PrismaLibSql({ url, authToken });
const prisma = new PrismaClient({ adapter });

async function setupFTS() {
  await prisma.$executeRawUnsafe(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      id UNINDEXED,
      title,
      content,
      tags,
      content='Note',
      content_rowid='rowid'
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON Note BEGIN
      INSERT INTO notes_fts(id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON Note BEGIN
      DELETE FROM notes_fts WHERE id = old.id;
      INSERT INTO notes_fts(id, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON Note BEGIN
      DELETE FROM notes_fts WHERE id = old.id;
    END;
  `);

  console.log("FTS5 setup complete");
}

setupFTS()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

The only change: added `authToken` from `DATABASE_AUTH_TOKEN` env var. For local dev, nothing changes (no auth token). For remote Turso DBs, set both env vars.

- [ ] **Step 2: Commit**

```bash
git add prisma/fts-setup.ts
git commit -m "fix: FTS setup script supports remote Turso DBs via auth token"
```

---

### Task 14: Vercel configuration

**Files:**
- Create: `vercel.json` (if needed)

- [ ] **Step 1: Verify build works**

```bash
npm run build
```

Expected: Build succeeds. Vercel will run this command automatically on deploy.

- [ ] **Step 2: Check if `vercel.json` is needed**

Vercel auto-detects Next.js projects. No `vercel.json` is needed unless you need custom settings. The env vars are set in the Vercel dashboard, not in config files.

- [ ] **Step 3: Add `.env.local` to `.gitignore` if not already there**

Check `.gitignore` — ensure `.env`, `.env.local`, and `dev.db` are listed.

- [ ] **Step 4: Commit any changes**

```bash
git add .gitignore
git commit -m "chore: ensure env files and dev.db are gitignored"
```

---

### Task 15: User DB migration script

For when you need to apply schema changes to all existing user databases.

**Files:**
- Create: `scripts/migrate-all-user-dbs.ts`

- [ ] **Step 1: Create the migration script**

Create `scripts/migrate-all-user-dbs.ts`:

```typescript
import { PrismaClient as AdminClient } from ".prisma/admin-client";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const adminUrl = process.env.ADMIN_DATABASE_URL;
  if (!adminUrl) {
    console.error("Set ADMIN_DATABASE_URL");
    process.exit(1);
  }

  const adminToken = process.env.ADMIN_DATABASE_AUTH_TOKEN ?? undefined;
  const adminAdapter = new PrismaLibSql({ url: adminUrl, authToken: adminToken });
  const admin = new AdminClient({ adapter: adminAdapter });

  const users = await admin.user.findMany();
  console.log(`Found ${users.length} user(s) to migrate`);

  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  const entries = fs.readdirSync(migrationsDir).sort();

  for (const user of users) {
    console.log(`\nMigrating ${user.username}...`);
    const adapter = new PrismaLibSql({
      url: user.tursoDbUrl,
      authToken: user.tursoDbToken,
    });
    const prisma = new PrismaClient({ adapter });

    try {
      for (const entry of entries) {
        const migrationSql = path.join(migrationsDir, entry, "migration.sql");
        if (!fs.existsSync(migrationSql)) continue;
        const sql = fs.readFileSync(migrationSql, "utf-8");
        const statements = sql
          .split(";")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        for (const stmt of statements) {
          // Use IF NOT EXISTS where possible — re-running migrations is safe
          await prisma.$executeRawUnsafe(stmt).catch(() => {
            // Table/index already exists — expected for previously applied migrations
          });
        }
      }
      console.log(`  ✓ ${user.username} migrated`);
    } catch (err) {
      console.error(`  ✗ ${user.username} failed:`, err);
    } finally {
      await prisma.$disconnect();
    }
  }

  await admin.$disconnect();
  console.log("\nDone.");
}

main().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/migrate-all-user-dbs.ts
git commit -m "feat: script to migrate all user databases on schema changes"
```

---

### Task 16: End-to-end manual test

No automated test for this — it requires Turso credentials.

- [ ] **Step 1: Create Turso account and admin database**

```bash
# Install Turso CLI if needed
brew install tursodatabase/tap/turso
turso auth login

# Create admin database
turso db create obsid-admin
turso db show obsid-admin --url    # → ADMIN_DATABASE_URL
turso db tokens create obsid-admin  # → ADMIN_DATABASE_AUTH_TOKEN
```

- [ ] **Step 2: Set up local `.env.local` with Turso credentials**

Add to `.env.local`:

```
ADMIN_DATABASE_URL=libsql://obsid-admin-<your-org>.turso.io
ADMIN_DATABASE_AUTH_TOKEN=<token>
TURSO_API_TOKEN=<your-platform-api-token>
TURSO_ORG=<your-org>
JWT_SECRET=<random-32-char-string>
ADMIN_USERNAME=<your-username>
```

- [ ] **Step 3: Apply admin migrations**

```bash
# Use the libsql client to apply admin migration SQL
npx tsx -e "
  const { PrismaClient } = require('.prisma/admin-client');
  const { PrismaLibSql } = require('@prisma/adapter-libsql');
  const fs = require('fs');
  const url = process.env.ADMIN_DATABASE_URL;
  const authToken = process.env.ADMIN_DATABASE_AUTH_TOKEN;
  const adapter = new PrismaLibSql({ url, authToken });
  const prisma = new PrismaClient({ adapter });
  const sql = fs.readFileSync('prisma/admin-migrations/001_init.sql', 'utf-8');
  const stmts = sql.split(';').map(s => s.trim()).filter(s => s);
  (async () => {
    for (const stmt of stmts) await prisma.\$executeRawUnsafe(stmt);
    console.log('Admin migrations applied');
    await prisma.\$disconnect();
  })();
"
```

- [ ] **Step 4: Generate an invite code**

```bash
npx tsx scripts/generate-invite.ts
```

- [ ] **Step 5: Start dev server and test the full flow**

```bash
npm run dev
```

1. Visit http://localhost:3000 — should redirect to `/login`
2. Click "Sign up" → enter invite code, username, password
3. Should create a Turso DB and redirect to the main app
4. Create a note, add tags, test slash commands
5. Open a new incognito window → should redirect to `/login`
6. Try logging in with the credentials from step 2

- [ ] **Step 6: Deploy to Vercel**

1. Push to GitHub
2. Connect repo to Vercel
3. Set all env vars in Vercel dashboard
4. Deploy
5. Test the same flow on the live URL

---

### Task 17: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add deployment and auth documentation to CLAUDE.md**

Add a new section covering:
- The two-tier database architecture (admin DB + per-user DBs)
- How `getDb(request)` works and the `db` parameter on lib functions
- The proxy.ts auth flow
- New env vars
- Scripts (`generate-invite.ts`, `provision-user-db.ts`, `migrate-all-user-dbs.ts`)
- That `proxy.ts` is the Next.js 16 name for middleware

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add multi-user deployment architecture to CLAUDE.md"
```
