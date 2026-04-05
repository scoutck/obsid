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
```

## Architecture

**Obsid** is an AI-powered markdown knowledge base — a single Next.js 16 app with a CodeMirror 6 editor, SQLite storage via Prisma, and Claude AI integration.

### The UI is one element: the editor

`src/app/page.tsx` is the entire app. It manages note state, auto-save, and all command handlers. The `Editor` component (`src/components/Editor.tsx`) wraps CodeMirror 6 and owns the slash menu. There is no sidebar, toolbar, or navigation — everything goes through the `/` slash command menu or keyboard.

### Prisma v7 + libsql adapter

This project uses Prisma 7 which requires a driver adapter. `src/lib/db.ts` creates the singleton client with `PrismaLibSql({ url })`. The `@prisma/adapter-libsql` and `@libsql/client` packages are required — don't try to use Prisma without the adapter.

Tags and links are stored as JSON strings in SQLite (`"[]"`), parsed in `src/types/index.ts` via `parseNote()` / `parseCollection()`. All lib functions return parsed types, not raw DB rows.

### Full-text search

`prisma/fts-setup.ts` creates a virtual FTS5 table (`notes_fts`) with triggers to keep it synced with the `Note` table. Search in `src/lib/notes.ts` tries FTS first, falls back to LIKE queries (needed for test environment where FTS table may not exist).

### CodeMirror extensions

Custom extensions live in `src/editor/`:
- `markdown-preview.ts` — ViewPlugin that hides markdown markers (`**`, `#`, etc.) on unfocused lines and shows them on the active line (Obsidian-style live preview). Rebuilds on `selectionSet` changes.
- `slash-commands.ts` — Command definitions with `action` namespace (`format:*`, `note:*`, `org:*`, `ai:*`) and filtering logic.
- `formatting.ts` — Pure functions for text wrapping/insertion. `applyFormatting` is testable without DOM, `executeFormatting` dispatches CodeMirror transactions.
- `wiki-links.ts` — Regex-based `[[link]]` decoration and `extractWikiLinks()` for saving link references.
- `tag-syntax.ts` — `#tag` highlighting (ViewPlugin) + `/claude` and `✓`/`✗` line styling. Skips code blocks, headings, inline code.

The Editor also owns a `TagMenu` autocomplete dropdown (triggered by `#`) alongside the `SlashMenu`.

The Editor detects `/` via an `updateListener`, positions the `SlashMenu` component at cursor coordinates, and on selection removes the slash text then calls the page's `onSlashCommand` handler via `requestAnimationFrame` to ensure view state is settled.

### AI integration

`src/lib/ai-tools.ts` defines five vault tools (`search_notes`, `read_note`, `create_note`, `update_note`, `list_people`) and an `executeTool` dispatcher. `src/app/api/ai/route.ts` implements the Anthropic tool-use loop: send message → if `stop_reason === "tool_use"`, execute tools and send results back → repeat until final text response.

### AI organize system

`src/app/api/ai/organize/route.ts` — single Sonnet prompt with vault context (top tags, note titles, recent siblings, people list). Called on note close (fire-and-forget) and via `/organize` slash command. Appends `#tags` and `[[links]]` to note content, creates/links people.

`src/app/api/ai/command/route.ts` — `/claude` inline commands. Tool-use loop like Ask Claude. Returns short confirmation text.

### Person system

Person = Note with `type: "person"` + `PersonMeta` (aliases, role). `NotePerson` join table tracks mentions. `src/lib/people.ts` handles CRUD with case-insensitive alias resolution (returns null for ambiguous matches). `unresolvedPeople` JSON field on Note stores names the AI couldn't match.

### Tag system

Tags are inline `#tag` text in note content — content is the source of truth. `src/lib/extract-tags.ts` has the pure `extractInlineTags()` function (client-safe). `src/lib/tags.ts` re-exports it and adds `getTagVocabulary()` (server-only, uses Prisma). The `tags` DB field is a search cache populated on auto-save.

### Testing

Vitest with `fileParallelism: false` (SQLite concurrency). `tests/setup.ts` creates a fresh `prisma/test.db` by applying all migrations in `prisma/migrations/` (sorted, sequential). Tests hit a real database, not mocks.

### State management pattern

`page.tsx` uses a `contentRef` (not `content` state) for the auto-save callback to avoid re-rendering the entire component tree on every keystroke. The Editor's `useEffect` has `[]` deps — it creates the CodeMirror instance once. Note switching uses `key={noteId}` to force a full remount.

## Gotchas

- **Never add `initialContent` to the Editor useEffect deps.** The editor creates once on mount (`[]` deps) and uses `initialContentRef`. Note switching remounts via `key={noteId}`. Adding content to deps destroys/recreates CodeMirror on every keystroke.
- **Slash command execution must use `requestAnimationFrame`.** The slash text is removed via `view.dispatch`, then the command handler runs in the next frame so the view state is settled. Without this, formatting commands read stale cursor positions.
- **GFM must be enabled explicitly.** `markdown({ extensions: [GFM] })` from `@lezer/markdown` — without it, `~~strikethrough~~` won't be parsed by lezer and the preview extension can't find `Strikethrough` nodes.
- **FTS5 blocks `prisma migrate dev`.** The virtual table causes persistent drift detection. Create migration SQL manually, apply with `prisma migrate deploy`, then `prisma generate`.
- **`prisma generate` after schema changes.** The dev server uses the generated client — if you add models/fields and only run migrate, the runtime client is stale. Always run `npx prisma generate` after migrations.
- **Client/server import boundary for pure functions.** `extractInlineTags` lives in `src/lib/extract-tags.ts` (no Prisma import) so `page.tsx` can use it. `src/lib/tags.ts` re-exports it for server use. Don't import `src/lib/tags.ts` from client components — it pulls in Prisma.
- **`/claude` Enter key must insert a newline.** The custom Enter keymap fires the command AND inserts `\n` + moves cursor so the user can keep typing. Without this, Enter is swallowed and the user is stuck on the `/claude` line.
