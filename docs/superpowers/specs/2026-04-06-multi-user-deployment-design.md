# Multi-User Deployment Design

Deploy Obsid as a multi-user app on Turso + Vercel with invite-code registration and per-user database isolation.

## Goals

- Host Obsid live so a small group of friends can each have their own private vault
- Invite-code gated signup (one-time codes, you control access)
- Username + password auth
- Minimal changes to existing query code
- Start fresh (no local data migration)

## Architecture

### Two-tier database model

**Admin database** (single Turso DB): stores users, invite codes. Shared across the app.

**Per-user databases** (one Turso DB per user): identical schema to the current local SQLite database. Each user gets complete data isolation — their own notes, conversations, people, embeddings, commands, and FTS5 index.

This avoids adding `userId` columns to all 9 tables and changing every query. Existing lib functions (`src/lib/notes.ts`, `src/lib/people.ts`, `src/lib/conversations.ts`, etc.) work unchanged — they just receive a different Prisma client per request.

### Admin database schema

```prisma
model User {
  id             String   @id @default(uuid())
  username       String   @unique
  passwordHash   String
  tursoDbUrl     String
  tursoDbToken   String
  createdAt      DateTime @default(now())
}

model InviteCode {
  id        String    @id @default(uuid())
  code      String    @unique
  usedBy    String?
  createdAt DateTime  @default(now())
  usedAt    DateTime?
}
```

### User database schema

Identical to the current `prisma/schema.prisma` — Note, Collection, PersonMeta, NotePerson, Command, Embedding, Conversation, Message, PendingPerson. No changes.

## Auth Flow

### Signup

1. User visits `/signup`, enters invite code + username + password
2. Server validates: code exists and is unused, username is not taken
3. Hashes password with bcrypt
4. Calls Turso Platform API to create a new database for this user
5. Runs Prisma migrations against the new DB
6. Runs FTS5 setup (`prisma/fts-setup.ts`) against the new DB
7. Stores user record (username, password hash, Turso DB URL + token) in admin DB
8. Marks invite code as used (`usedBy` = user ID, `usedAt` = now)
9. Issues a JWT in an httpOnly cookie, redirects to `/`

### Login

1. User visits `/login`, enters username + password
2. Server looks up user in admin DB, verifies password hash
3. Issues JWT in an httpOnly cookie, redirects to `/`

### JWT payload

```json
{
  "sub": "<user-id>",
  "username": "<username>",
  "exp": "<30-day expiry>"
}
```

Stored in an httpOnly, secure, sameSite=lax cookie.

## Per-Request Database Routing

### Middleware (`src/middleware.ts`)

1. Reads JWT from cookie
2. Validates signature and expiry
3. Looks up user in admin DB to get their Turso DB URL + token
4. Injects DB URL and token into request headers (`x-user-db-url`, `x-user-db-token`) — internal headers stripped on ingress
5. Unauthenticated requests to protected routes redirect to `/login`
6. Public routes: `/login`, `/signup`, `/api/auth/*`

### User DB client (`src/lib/user-db.ts`)

Replaces the current singleton in `src/lib/db.ts`:

```typescript
function getUserDb(url: string, authToken: string): PrismaClient {
  // LRU cache keyed by URL to avoid creating a new client per request
  // Evict after ~50 entries to bound memory
}
```

API routes read the headers and call `getUserDb()` instead of importing a global `prisma`.

### Changes to `src/lib/db.ts`

The current singleton pattern stays for local development. `getUserDb()` is the production path. A helper function abstracts this:

```typescript
export function getDb(request?: Request): PrismaClient {
  if (process.env.NODE_ENV === "production" && request) {
    const url = request.headers.get("x-user-db-url")!;
    const token = request.headers.get("x-user-db-token")!;
    return getUserDb(url, token);
  }
  return prisma; // local dev singleton
}
```

## Invite Code Generation

### CLI script (`scripts/generate-invite.ts`)

```bash
npx tsx scripts/generate-invite.ts
# Output: Invite code: abc123-def456
```

Generates a random code, inserts into admin DB's InviteCode table. Run locally with `ADMIN_DATABASE_URL` set.

### Admin API route (optional)

`POST /api/admin/invite-codes` — protected by checking that the requesting user's username matches an `ADMIN_USERNAME` env var. Returns the generated code.

## New Files

| File | Purpose |
|------|---------|
| `prisma/admin-schema.prisma` | User + InviteCode schema |
| `src/lib/admin-db.ts` | Prisma client for admin database |
| `src/lib/user-db.ts` | Per-user Prisma client factory with LRU cache |
| `src/lib/auth.ts` | bcrypt hashing, JWT sign/verify |
| `src/middleware.ts` | Auth check + DB URL injection |
| `src/app/login/page.tsx` | Login page |
| `src/app/signup/page.tsx` | Signup page with invite code field |
| `src/app/api/auth/login/route.ts` | Login endpoint |
| `src/app/api/auth/signup/route.ts` | Signup + DB provisioning endpoint |
| `src/app/api/admin/invite-codes/route.ts` | Invite code generation (admin only) |
| `scripts/generate-invite.ts` | CLI invite code generator |
| `scripts/provision-user-db.ts` | Turso DB creation + migration + FTS5 setup |

## Modified Files

| File | Change |
|------|--------|
| `src/lib/db.ts` | Add `getDb(request?)` that routes to user DB in production |
| `src/app/api/ai/route.ts` | Use `getDb(request)` instead of global `prisma` |
| `src/app/api/ai/chat/route.ts` | Use `getDb(request)` |
| `src/app/api/ai/command/route.ts` | Use `getDb(request)` |
| `src/app/api/ai/organize/route.ts` | Use `getDb(request)` |
| `src/app/api/ai/person-summary/route.ts` | Use `getDb(request)` |
| `src/app/api/notes/*/route.ts` | Use `getDb(request)` |
| `src/app/api/collections/*/route.ts` | Use `getDb(request)` |
| `src/app/api/people/*/route.ts` | Use `getDb(request)` |
| `src/app/api/conversations/*/route.ts` | Use `getDb(request)` |
| `src/app/page.tsx` | Redirect to `/login` if no session |
| `prisma/fts-setup.ts` | Accept DB URL parameter instead of hardcoded dev.db |
| `next.config.ts` | No changes expected |

## Lib Layer Change

All 8 lib files (`notes.ts`, `people.ts`, `conversations.ts`, `collections.ts`, `commands.ts`, `embeddings.ts`, `pending-people.ts`, `tags.ts`) currently import the global `prisma` singleton directly from `@/lib/db`. Two options:

**Option A (recommended): Make `db.ts` export a request-scoped getter.** Use Next.js `AsyncLocalStorage` or a request-context pattern so that `import { prisma } from "@/lib/db"` returns the correct per-user client automatically. This means zero changes to the 8 lib files.

**Option B: Pass `prisma` as a parameter to all lib functions.** More explicit, but touches every function signature and every call site in every API route.

Option A is preferred — it preserves the current import pattern and minimizes diff size.

## Unchanged

- All `src/lib/` query function implementations (the actual queries inside notes.ts, people.ts, etc.)
- Editor component, slash commands, CodeMirror extensions
- ChatView, TagMenu, SlashMenu
- User database schema (identical to current)

## Environment Variables (Vercel)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API access |
| `VOYAGE_API_KEY` | Voyage AI embeddings |
| `TURSO_API_TOKEN` | Turso Platform API (creating user DBs) |
| `TURSO_ORG` | Your Turso organization slug |
| `ADMIN_DATABASE_URL` | Turso URL for admin database |
| `ADMIN_DATABASE_AUTH_TOKEN` | Auth token for admin database |
| `JWT_SECRET` | Signing key for JWT cookies |
| `NEXT_PUBLIC_BASE_URL` | Production URL (for internal fetch calls) |
| `ADMIN_USERNAME` | Your username (for admin-only endpoints) |

## Deployment Pipeline

### Initial setup (one-time)

1. Create Turso account and organization
2. Create admin database: `turso db create obsid-admin`
3. Get admin DB URL and token from Turso dashboard
4. Connect GitHub repo to Vercel
5. Set all env vars in Vercel dashboard
6. Deploy — Vercel builds and deploys automatically
7. Run admin migrations against admin DB
8. Generate first invite code via CLI script
9. Sign up as the first user

### Ongoing

- Push to `main` triggers Vercel auto-deploy
- New user: run `npx tsx scripts/generate-invite.ts`, send them the code
- Schema changes to user DBs: run a migration script that iterates all users in admin DB and applies migrations to each user's Turso DB

## Not in Scope (v1)

- Password reset (friends can ask you directly)
- Email verification (invite code is the gate)
- Admin dashboard UI (CLI scripts suffice for a small group)
- Rate limiting (small trusted group)
- Database backups (Turso handles automatically)
- Local data migration (starting fresh)
