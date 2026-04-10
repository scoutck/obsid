# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm test             # Run all tests (vitest, sequential)
npm test -- tests/lib/notes.test.ts  # Run single test file
npx tsc --noEmit     # Type check without emitting
npm run lint         # ESLint
npx playwright test  # Run E2E tests (separate from vitest)
npx prisma migrate dev --name <name>  # Create migration
npx tsx prisma/fts-setup.ts           # Set up FTS5 virtual table + triggers
npx tsx prisma/migrate-commands.ts    # Migrate /claude commands from note content to Command table
npx tsx scripts/generate-invite.ts   # Generate an invite code (needs ADMIN_DATABASE_URL)
npx tsx scripts/migrate-all-user-dbs.ts  # Apply migrations to all user databases
npx prisma generate --schema=prisma/admin-schema.prisma  # Generate admin Prisma client
```

## Architecture

**Obsid** is an AI-powered markdown knowledge base — a single Next.js 16 app with a CodeMirror 6 editor, SQLite storage via Prisma, and Claude AI integration.

### Two modes: notes and chat

`src/app/page.tsx` is the entire app. It manages mode state (`"notes" | "chat"`), note state, auto-save, and all command handlers. In notes mode, the `Editor` component (`src/components/Editor.tsx`) wraps CodeMirror 6 and owns the slash menu. In chat mode, `ChatView` (`src/components/ChatView.tsx`) renders a persistent conversation with Claude. Switch via `/chatmode` and `/notemode` slash commands. There is no sidebar, toolbar, or navigation — everything goes through the `/` slash command menu or keyboard. Slash commands are mode-aware (`slash-commands.ts` has a `mode` field).

### Two-tier database architecture (multi-user)

**Admin database** (single Turso DB): stores users and invite codes. `prisma/admin-schema.prisma` defines the schema, `src/lib/admin-db.ts` provides `adminPrisma` (lazy-initialized proxy to avoid build-time crashes). Admin migrations live in `prisma/admin-migrations/`.

**Per-user databases** (one Turso DB per user): identical schema to the local `prisma/schema.prisma`. Each user gets complete data isolation.

`src/proxy.ts` (Next.js 16 proxy, replaces middleware) checks the JWT cookie, looks up the user's Turso DB credentials in the admin DB, and injects them as `x-user-db-url` / `x-user-db-token` headers. API routes call `getDb(request)` from `src/lib/db.ts` to get the per-user Prisma client. All 14 lib files accept an optional `db: PrismaClient` parameter (defaults to the dev singleton).

`src/lib/user-db.ts` has an LRU cache (max 50) of Prisma clients keyed by Turso URL.

Auth: `src/lib/auth.ts` (bcrypt + JWT). Routes: `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout`. Pages: `/login`, `/signup`. Invite-code gated signup.

Scripts: `scripts/generate-invite.ts` (create invite codes), `scripts/provision-user-db.ts` (create Turso DB + run migrations + FTS5), `scripts/migrate-all-user-dbs.ts` (apply schema changes to all user DBs).

### Prisma v7 + libsql adapter

This project uses Prisma 7 which requires a driver adapter. `src/lib/db.ts` creates the singleton client with `PrismaLibSql({ url })` and exports `getDb(request?)` for per-user DB routing. The `@prisma/adapter-libsql` and `@libsql/client` packages are required — don't try to use Prisma without the adapter.

Tags and links are stored as JSON strings in SQLite (`"[]"`), parsed in `src/types/index.ts` via `parseNote()` / `parseCollection()`. All lib functions return parsed types, not raw DB rows.

The `Command` table stores `/claude` command history (instruction, confirmation, status, line number). `src/lib/commands.ts` has CRUD. No Prisma `@relation` directives are used in this project — cascade deletes are handled manually in API routes (e.g., `deleteCommandsForNote` before `deleteNote`).

### Full-text search

`prisma/fts-setup.ts` creates a virtual FTS5 table (`notes_fts`) with triggers to keep it synced with the `Note` table. Search in `src/lib/notes.ts` tries FTS first, falls back to LIKE queries (needed for test environment where FTS table may not exist).

### CodeMirror extensions

Custom extensions live in `src/editor/`:
- `markdown-preview.ts` — ViewPlugin that hides markdown markers (`**`, `#`, etc.) on unfocused lines and shows them on the active line (Obsidian-style live preview). Rebuilds on `selectionSet` changes.
- `slash-commands.ts` — Command definitions with `action` namespace (`format:*`, `note:*`, `org:*`, `ai:*`) and filtering logic.
- `formatting.ts` — Pure functions for text wrapping/insertion. `applyFormatting` is testable without DOM, `executeFormatting` dispatches CodeMirror transactions.
- `wiki-links.ts` — Regex-based `[[link]]` decoration and `extractWikiLinks()` for saving link references.
- `tag-syntax.ts` — `#tag` highlighting (ViewPlugin). Skips code blocks, headings, inline code.
- `command-widgets.ts` — StateField + widget decorations for `/claude` commands stored in the Command table. Uses `addCommandEffect`/`updateCommandEffect` and `mapPos` for position tracking through edits.

The Editor also owns a `TagMenu` autocomplete dropdown (triggered by `#`) alongside the `SlashMenu`.

The Editor detects `/` via an `updateListener`, positions the `SlashMenu` component at cursor coordinates, and on selection removes the slash text then calls the page's `onSlashCommand` handler via `requestAnimationFrame` to ensure view state is settled.

### Semantic search via embeddings

Every note is embedded on save via Voyage AI (`voyage-3`, 1024 dims). `src/lib/embeddings.ts` has `embedNote()` (fire-and-forget on save), `semanticSearch()` (brute-force cosine over all embeddings), and pure `cosineSimilarity()`/`rankBySimilarity()` functions. Vectors stored as binary blobs in the `Embedding` table. `VOYAGE_API_KEY` env var required. Falls back to FTS5 if embeddings unavailable.

### AI integration

`src/lib/ai-tools.ts` defines seven vault tools (`semantic_search`, `read_note`, `create_note`, `update_note`, `list_people`, `update_person`, `create_pending_person`) and an `executeTool` dispatcher with optional `meta` param for source tracking. `src/app/api/ai/route.ts` implements the Anthropic tool-use loop: send message → if `stop_reason === "tool_use"`, execute tools and send results back → repeat until final text response.

### Chat system

`src/app/api/ai/chat/route.ts` — persistent chat with Claude. Saves user + assistant messages to `Conversation`/`Message` tables. Tool-use loop with vault tools + semantic search. Auto-titles conversation from first message. `src/lib/conversations.ts` has CRUD for conversations and messages.

### AI organize system

`src/app/api/ai/organize/route.ts` — single Sonnet prompt with vault context (100 recent note titles, recent siblings, people list). Called on note close (2s debounced, fire-and-forget) and via `/organize` slash command. Fetches note server-side, snapshots `updatedAt`, uses atomic conditional update to discard results if note changed during AI processing. Appends `[[links]]` to note content, links known people. Tags are user-owned — organize does NOT modify tags. Unrecognized names create `PendingPerson` entries instead of auto-creating person notes.

`src/app/api/ai/command/route.ts` — `/claude` inline commands. Tool-use loop like Ask Claude. Stores command + confirmation in the `Command` table (not in note content). `GET /api/notes/[id]/commands` fetches commands for a note.

### Think system

`src/app/api/ai/think/route.ts` — `/think` slash command for deep note reasoning. Tool-use loop with extended thinking and read-only vault tools (`readOnlyVaultTools` from `ai-tools.ts`). Explores the vault via `semantic_search`, `read_note`, `search_by_tags`, `search_by_person`, `get_note_graph`, `search_by_timeframe`. Appends a `**Connections**` section to the note with `[[wiki-links]]` and reasoning. Also writes `UserInsight` entries. On-demand only (user invokes `/think`). Re-fetches note before writing to avoid stale `updatedAt`. Forces a final no-tools API call if tool round limit (8) is hit.

Organize generates a semantic `summary` (Haiku call) on every note close, stored in `Note.summary`. Embeddings use `title + summary + content` for richer semantic search. `loadEmbeddingCache()` pre-loads all embeddings for multi-query `/think` calls.

### Person system

Person = Note with `type: "person"` + `PersonMeta` (aliases, role, summary, userContext). `NotePerson` join table tracks mentions (with `highlight` field). `src/lib/people.ts` handles CRUD with case-insensitive alias resolution (returns null for ambiguous matches).

`PendingPerson` table stores AI-detected names awaiting user confirmation. `/pendingpeople` command opens review modal (confirm → `/newperson` flow, merge with existing, or dismiss). `src/lib/pending-people.ts` has CRUD with deduplication.

`/newperson` command: stepped inline flow (name → role → context). Creates person note + PersonMeta + auto-generates aliases.

`/api/ai/person-summary` — regenerates AI-maintained relationship summary for a person. Fire-and-forget on new person-note links.

### User profile system

`UserInsight` table stores raw AI-harvested observations about the user (category, content, evidence, sourceNoteId). The organize endpoint's prompt is extended to detect self-reflective writing and store insights automatically. `/me` slash command opens `UserProfilePage`, which fetches all insights and sends them to `/api/ai/user-profile` for on-demand synthesis into a structured profile (summary, expertise, patterns, thinking style). `src/lib/user-insights.ts` has CRUD.

### Tag system

Tags are inline `#tag` text in note content — content is the source of truth. Tags are user-owned; the AI does not add or modify tags. `src/lib/extract-tags.ts` has the pure `extractInlineTags()` function (client-safe). `src/lib/tags.ts` re-exports it and adds `getTagVocabulary()` (server-only, uses Prisma). The `tags` DB field is a search cache populated on auto-save.

### Testing

Vitest with `fileParallelism: false` (SQLite concurrency). `tests/setup.ts` creates a fresh `prisma/test.db` by applying all migrations in `prisma/migrations/` (sorted, sequential). Tests hit a real database, not mocks.

**Test patterns:**
- Import `{ prisma } from "@/lib/db"` for direct DB access in tests (uses test.db singleton).
- Create test data via lib functions (`createNote()`, `createPerson()`), not raw Prisma calls.
- `beforeEach` cleanup must respect FK constraints — delete in order: `notePerson` → `personMeta` → `pendingPerson` → `command` → `embedding` → `message` → `conversation` → `userInsight` → `task` → `note`.
- Test directories: `tests/lib/` (unit), `tests/api/` (API), `tests/editor/` (editor), `tests/workflows/` (integration), `tests/edge-cases/` (stress tests), `tests/e2e/` (Playwright).
- FTS5 table doesn't exist in test DB — `searchNotes()` always uses LIKE fallback in tests.

### State management pattern

`page.tsx` uses a `contentRef` (not `content` state) for the auto-save callback to avoid re-rendering the entire component tree on every keystroke. The Editor's `useEffect` has `[]` deps — it creates the CodeMirror instance once. Note switching uses `key={noteId}` to force a full remount.

## Gotchas

- **Never add `initialContent` to the Editor useEffect deps.** The editor creates once on mount (`[]` deps) and uses `initialContentRef`. Note switching remounts via `key={noteId}`. Adding content to deps destroys/recreates CodeMirror on every keystroke.
- **Slash command execution must use `requestAnimationFrame`.** The slash text is removed via `view.dispatch`, then the command handler runs in the next frame so the view state is settled. Without this, formatting commands read stale cursor positions.
- **GFM must be enabled explicitly.** `markdown({ extensions: [GFM] })` from `@lezer/markdown` — without it, `~~strikethrough~~` won't be parsed by lezer and the preview extension can't find `Strikethrough` nodes.
- **FTS5 blocks `prisma migrate dev`.** The virtual table causes persistent drift detection. Create migration SQL manually, apply with `prisma migrate deploy`, then `prisma generate`.
- **FTS5 triggers may corrupt `dev.db` on Prisma writes.** If you see `SQLITE_CORRUPT` errors, delete `dev.db` and rebuild with `npx prisma migrate deploy`. Only run `npx tsx prisma/fts-setup.ts` after confirming basic writes work. Search falls back to LIKE queries when FTS is unavailable.
- **`dev.db` lives at the project root, not `prisma/`.** The `file:./dev.db` URL resolves from Next.js CWD (project root). If `prisma/dev.db` exists, it's stale or empty — delete it. To reset: `rm -f dev.db prisma/dev.db && npx prisma migrate deploy`.
- **`createPerson` auto-prepends `input.name` to aliases.** Pass only *extra* aliases (e.g., first name), not the full name. The name is always the first alias.
- **`prisma generate` after schema changes.** The dev server uses the generated client — if you add models/fields and only run migrate, the runtime client is stale. Always run `npx prisma generate` after migrations.
- **Client/server import boundary for pure functions.** `extractInlineTags` lives in `src/lib/extract-tags.ts` (no Prisma import) so `page.tsx` can use it. `src/lib/tags.ts` re-exports it for server use. Don't import `src/lib/tags.ts` from client components — it pulls in Prisma.
- **`/claude` Enter key removes the line from content.** The custom Enter keymap detects `/claude <instruction>`, deletes the line, stores a Command in the DB, and adds a widget decoration via `addCommandEffect`. The command text never persists in note content.
- **Raw SQL timestamp parameters: use `new Date().toISOString()` for SET, raw `Date` objects for WHERE.** Prisma's libsql adapter serializes `Date` objects to ISO strings matching `@updatedAt` format. But passing `.toISOString()` (a string) in a WHERE clause fails because the adapter returns `Date` objects from queries — string-vs-Date comparison never matches. For SET clauses, ISO strings work fine. Never use SQLite's `CURRENT_TIMESTAMP` (produces `2026-04-05 22:00:00` — no millis, space separator).
- **`VOYAGE_API_KEY` must be set for semantic search.** Without it, embeddings fail silently and search falls back to FTS5. Add to `.env.local`.
- **Chat messages are not notes.** Chat is stored in `Conversation`/`Message` tables, not in Note content. Don't confuse the two.
- **Person summaries regenerate on link.** Fire-and-forget POST to `/api/ai/person-summary`. Receives current summary as input to preserve user edits.
- **AI JSON responses may include markdown fences.** Claude sometimes wraps JSON in ` ```json ``` ` despite prompt instructions. All AI routes that parse JSON from Claude should strip fences: `resultText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim()`.
- **`proxy.ts` is Next.js 16 proxy (not middleware).** Next.js 16 renamed `middleware.ts` to `proxy.ts`. The exported function must be named `proxy`. It handles auth + per-user DB header injection.
- **`adminPrisma` is a lazy proxy.** `src/lib/admin-db.ts` uses a Proxy to defer client creation until first use. This prevents build-time crashes when `ADMIN_DATABASE_URL` isn't set.
- **All lib functions accept optional `db` param.** Every exported function in `notes.ts`, `people.ts`, `conversations.ts`, etc. takes `db: PrismaClient = defaultPrisma` as its last parameter. API routes pass `getDb(request)` for per-user routing.
- **Deployed on Railway (not Vercel).** Prisma's query engine causes 5-7s cold starts on serverless (Vercel). Railway runs a persistent Node.js process — Prisma loads once at startup. Env vars: `ADMIN_DATABASE_URL`, `ADMIN_DATABASE_AUTH_TOKEN`, `TURSO_API_TOKEN`, `TURSO_ORG`, `JWT_SECRET`, `ADMIN_USERNAME`, `NEXT_PUBLIC_BASE_URL`, `VOYAGE_API_KEY`, `ANTHROPIC_API_KEY`. All set in Railway dashboard.
- **`NEXT_PUBLIC_BASE_URL` must match the deployment URL.** Used for fire-and-forget internal fetches (person summaries). If set to `localhost:3000` in production, those calls silently fail.
- **Fire-and-forget fetches forward cookies.** `ai-tools.ts` and `organize/route.ts` forward the `Cookie` header in internal person-summary fetches so the proxy can authenticate them.
- **Turso tokens stored in plaintext in admin DB.** Per-user DB auth tokens are not encrypted at rest. Acceptable for v1 (small trusted group), but encrypt them if the admin DB ever faces broader access.
- **DB-touching tests need `// @vitest-environment node` pragma.** The default jsdom environment provides its own `Uint8Array`/`Buffer` which the libsql adapter rejects (`Expected a byte array, got object: [object ArrayBuffer]`). Add the pragma as the first line of any test file that imports from `@/lib/db` or uses Prisma. Also required for `jose` tests (same realm mismatch).
- **`Secure` cookie flag must be conditional.** Use `process.env.NODE_ENV === "production" ? "; Secure" : ""` in Set-Cookie headers. `Secure` cookies are not sent over `http://localhost` in some browsers.
- **Standalone scripts don't load `.env.local`.** Run with `set -a && source .env.local && set +a && npx tsx scripts/foo.ts`. Next.js auto-loads env files but `npx tsx` does not.
- **Both slash command handlers must handle shared commands.** Commands without a `mode` field appear in both notes and chat, but `handleSlashCommand` (notes) and `handleChatSlashCommand` (chat) are separate functions in `page.tsx`. Add handlers to both.
- **Never eagerly create clients at module top level if they need env vars.** `npm run build` imports all route modules for page data collection. Modules that throw at import time (e.g., missing `ADMIN_DATABASE_URL`) crash the build. Use lazy patterns like the Proxy in `admin-db.ts`.
- **Never loop with individual queries.** Use `findMany({ where: { id: { in: ids } } })` + a Map instead of looping with `findUnique`. Use `Promise.all` for independent awaits in API routes. This is how every N+1 in `people.ts` was introduced.
- **Batch helpers exist — use them.** `getPersonsByAliases(aliases, db)` resolves multiple aliases with one DB load (vs `getPersonByAlias` per alias). `addNotePeople(noteId, personNoteIds, db)` batch-creates links. `getNotesByIds(ids, db)` batch-fetches notes. Prefer these over sequential single-item calls.
- **Dev mode skips remote Turso routing.** The proxy bypasses `getUserCredentials` + header injection when `NODE_ENV !== "production"`, so `getDb()` falls through to local `dev.db`. Without this, every local dev query round-trips to remote Turso (~20s page loads).
- **DELETE `/api/notes/[id]` cascade order matters.** The handler cleans up: commands → embeddings → notePerson (both `noteId` and `personNoteId` directions) → personMeta → pendingPerson (nullify sourceNoteId) → userInsight → tasks (nullify noteId) → note. All directions are covered — follow this order when adding new related tables.
- **Parse functions use safe JSON helpers.** `parseNote()`, `parsePersonMeta()`, `parseChatMessage()` use `safeParseArray()`/`safeParseJson()` from `src/types/index.ts`. Malformed JSON returns fallback values (empty arrays/objects) instead of throwing.
- **Modal components use `next/dynamic`.** All conditionally-rendered components in `page.tsx` (modals, ChatView, PersonPage) are lazy-loaded. New modal/overlay components should follow the same pattern. Editor and Toast are static imports (always rendered / tiny).
- **Schema changes require remote migration.** After adding columns/tables and deploying, run `set -a && source .env.local && set +a && npx tsx scripts/migrate-all-user-dbs.ts` to apply to all user Turso DBs. Without this, production crashes with `no such column` errors.
- **FTS5 corruption affects remote Turso DBs too.** Same fix as local: drop triggers + table, recreate, repopulate. The FTS5 `rebuild` command does NOT work through Prisma's libsql adapter. Must manually `INSERT INTO notes_fts SELECT ... FROM Note` to repopulate.
- **`conditionalUpdateNote` fails silently when client saves first.** If the client PUTs content before calling an API endpoint that later uses `conditionalUpdateNote`, the `updatedAt` snapshot is stale. Re-fetch the note right before writing to get the current `updatedAt`.
- **Tool-use loops can exhaust rounds without producing text.** When `stop_reason === "tool_use"` after hitting `MAX_TOOL_ROUNDS`, the response has no text blocks. Force a final API call WITHOUT tools to make Claude synthesize its findings.
- **AI JSON responses may include preamble text.** Claude sometimes writes explanatory text before the JSON object despite prompt instructions. Extract JSON with `resultText.match(/\{[\s\S]*\}/)` as a fallback after fence stripping.
- **Toast duration must be extended for long-running operations.** The default 3s auto-dismiss is too short for `/think` (10-30s). Pass a longer `duration` prop and reset to 3000 when the operation completes.
