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

`src/proxy.ts` (Next.js 16 proxy, replaces middleware) checks the JWT cookie, looks up the user's Turso DB credentials in the admin DB, and injects them as `x-user-db-url` / `x-user-db-token` headers. API routes call `getDb(request)` from `src/lib/db.ts` to get the per-user Prisma client. All 8 lib files accept an optional `db: PrismaClient` parameter (defaults to the dev singleton).

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

### Person system

Person = Note with `type: "person"` + `PersonMeta` (aliases, role, summary, userContext). `NotePerson` join table tracks mentions (with `highlight` field). `src/lib/people.ts` handles CRUD with case-insensitive alias resolution (returns null for ambiguous matches).

`PendingPerson` table stores AI-detected names awaiting user confirmation. `/pendingpeople` command opens review modal (confirm → `/newperson` flow, merge with existing, or dismiss). `src/lib/pending-people.ts` has CRUD with deduplication.

`/newperson` command: stepped inline flow (name → role → context). Creates person note + PersonMeta + auto-generates aliases.

`/api/ai/person-summary` — regenerates AI-maintained relationship summary for a person. Fire-and-forget on new person-note links.

### Tag system

Tags are inline `#tag` text in note content — content is the source of truth. Tags are user-owned; the AI does not add or modify tags. `src/lib/extract-tags.ts` has the pure `extractInlineTags()` function (client-safe). `src/lib/tags.ts` re-exports it and adds `getTagVocabulary()` (server-only, uses Prisma). The `tags` DB field is a search cache populated on auto-save.

### Testing

Vitest with `fileParallelism: false` (SQLite concurrency). `tests/setup.ts` creates a fresh `prisma/test.db` by applying all migrations in `prisma/migrations/` (sorted, sequential). Tests hit a real database, not mocks.

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
- **Use ISO strings for raw SQL timestamps, not `CURRENT_TIMESTAMP`.** Prisma writes `@updatedAt` as ISO strings (`2026-04-05T22:00:00.123Z`). SQLite's `CURRENT_TIMESTAMP` produces `2026-04-05 22:00:00` (no millis, space separator). Mixing formats breaks conditional updates. Use `new Date().toISOString()` in parameterized queries.
- **`VOYAGE_API_KEY` must be set for semantic search.** Without it, embeddings fail silently and search falls back to FTS5. Add to `.env.local`.
- **Chat messages are not notes.** Chat is stored in `Conversation`/`Message` tables, not in Note content. Don't confuse the two.
- **Person summaries regenerate on link.** Fire-and-forget POST to `/api/ai/person-summary`. Receives current summary as input to preserve user edits.
- **`proxy.ts` is Next.js 16 proxy (not middleware).** Next.js 16 renamed `middleware.ts` to `proxy.ts`. The exported function must be named `proxy`. It handles auth + per-user DB header injection.
- **`adminPrisma` is a lazy proxy.** `src/lib/admin-db.ts` uses a Proxy to defer client creation until first use. This prevents build-time crashes when `ADMIN_DATABASE_URL` isn't set.
- **All lib functions accept optional `db` param.** Every exported function in `notes.ts`, `people.ts`, `conversations.ts`, etc. takes `db: PrismaClient = defaultPrisma` as its last parameter. API routes pass `getDb(request)` for per-user routing.
- **Multi-user env vars for Vercel.** `ADMIN_DATABASE_URL`, `ADMIN_DATABASE_AUTH_TOKEN`, `TURSO_API_TOKEN`, `TURSO_ORG`, `JWT_SECRET`, `ADMIN_USERNAME`, `NEXT_PUBLIC_BASE_URL`. All set in Vercel dashboard.
- **Fire-and-forget fetches forward cookies.** `ai-tools.ts` and `organize/route.ts` forward the `Cookie` header in internal person-summary fetches so the proxy can authenticate them.
- **Turso tokens stored in plaintext in admin DB.** Per-user DB auth tokens are not encrypted at rest. Acceptable for v1 (small trusted group), but encrypt them if the admin DB ever faces broader access.
