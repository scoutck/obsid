# Bug Finding & Testing Sweep — Design Spec

**Date:** 2026-04-07
**Branch:** `bugfix/testing-and-bug-finding`
**Approach:** Hybrid — workflows first, then gap fill, then edge cases
**Output:** Find all bugs, compile prioritized report, triage together, then fix

---

## Deliverable

A bug report at `docs/superpowers/specs/2026-04-07-bug-report.md` containing:
- Each bug: description, file location, reproduction steps, severity, category
- Sorted by severity (critical > high > medium > low)
- Summary stats by severity and area

No fixes during the sweep. Triage together after the report, then fix in agreed order.

---

## Phase 1: Workflow Tracing

Write integration tests that exercise the 4 core user workflows end-to-end. Every test failure or unexpected behavior = a catalogued bug.

### Workflow 1 — Note Lifecycle

Create note -> edit content -> auto-save (tag extraction, link extraction, wiki-link parsing) -> organize (AI linking, pending people creation) -> search (FTS5 + semantic fallback) -> delete (cascade cleanup of embeddings, commands, note-person links, pending people)

**Key files:**
- `src/lib/notes.ts`
- `src/lib/tags.ts`, `src/lib/extract-tags.ts`
- `src/editor/wiki-links.ts`
- `src/app/api/notes/route.ts`, `src/app/api/notes/[id]/route.ts`
- `src/app/api/ai/organize/route.ts`
- `src/app/api/search/route.ts`

**Test file:** `tests/workflows/note-lifecycle.test.ts`

### Workflow 2 — Person Lifecycle

AI detects name -> PendingPerson created (with deduplication) -> user confirms -> person note + PersonMeta + aliases created -> linked to source notes via NotePerson -> person summary generated (fire-and-forget) -> person deleted (cleanup of PersonMeta, NotePerson, aliases, embeddings)

**Key files:**
- `src/lib/pending-people.ts`
- `src/lib/people.ts`
- `src/app/api/people/route.ts`, `src/app/api/people/[id]/route.ts`, `src/app/api/people/create/route.ts`
- `src/app/api/ai/person-summary/route.ts`

**Test file:** `tests/workflows/person-lifecycle.test.ts`

### Workflow 3 — Chat Lifecycle

Start conversation -> send message -> tool-use loop (semantic_search, read_note, create_note, update_note, list_people, update_person, create_pending_person) -> save assistant message with tool calls -> resume conversation with history -> delete conversation (cascade cleanup of messages)

**Key files:**
- `src/lib/conversations.ts`
- `src/lib/ai-tools.ts`
- `src/app/api/ai/chat/route.ts`
- `src/app/api/conversations/route.ts`, `src/app/api/conversations/[id]/messages/route.ts`

**Test file:** `tests/workflows/chat-lifecycle.test.ts`

### Workflow 4 — Command Lifecycle

User types `/claude <instruction>` -> line removed from content -> Command row created (noteId, instruction, lineNumber) -> AI processes instruction (tool-use loop) -> confirmation stored in Command -> commands fetched for note display -> note deleted (commands cleaned up)

**Key files:**
- `src/lib/commands.ts`
- `src/app/api/ai/command/route.ts`
- `src/app/api/notes/[id]/commands/route.ts`
- `src/editor/command-widgets.ts`

**Test file:** `tests/workflows/command-lifecycle.test.ts`

---

## Phase 2: Targeted Unit Tests (Gap Fill)

Unit test untested lib modules to catch logic bugs the workflows missed.

### commands.ts
- CRUD: create, get by note, update status, delete for note
- Edge cases: create with missing fields, update non-existent command

**Test file:** `tests/lib/commands.test.ts`

### ai-tools.ts
- Tool dispatch: each of the 7 tools resolves correctly
- Input validation: missing/malformed tool inputs
- Error handling: tool execution failures
- Meta parameter passthrough

**Test file:** `tests/lib/ai-tools.test.ts`

### collections.ts (expanded)
- Filter application logic (beyond basic CRUD already tested)
- Collection with notes association

**Test file:** `tests/lib/collections.test.ts` (expand existing)

### embeddings.ts (DB-level)
- Store and retrieve embeddings
- Semantic search with real DB data
- Fallback behavior when embeddings unavailable

**Test file:** `tests/lib/embeddings.test.ts` (expand existing)

### auth.ts (edge cases)
- Expired JWT tokens
- Malformed JWTs
- Invalid passwords
- Token with tampered payload

**Test file:** `tests/lib/auth.test.ts` (expand existing)

---

## Phase 3: Edge Case Stress Tests

Targeted probes for known high-risk patterns.

### JSON Corruption Resilience
- Insert malformed JSON into tags, links, aliases fields
- Call parseNote(), parsePersonMeta(), parseChatMessage()
- Verify: graceful failure vs crash

**Test file:** `tests/edge-cases/json-corruption.test.ts`

### Race Conditions
- Concurrent PendingPerson creation with same name + sourceNoteId
- Organize fires while user is manually editing the same note
- Two simultaneous NotePerson link creations for same pair

**Test file:** `tests/edge-cases/race-conditions.test.ts`

### Cascade Delete Completeness
- Delete a regular note -> verify Embedding, Command, NotePerson, PendingPerson all cleaned up
- Delete a person note -> verify PersonMeta also deleted (suspected bug: it's NOT deleted currently)
- Delete a conversation -> verify all Messages deleted

**Test file:** `tests/edge-cases/cascade-deletes.test.ts`

### Null/Empty Input Handling
- Create note with empty string content
- Create person with empty aliases array
- Search with empty query string
- Organize note with no content

**Test file:** `tests/edge-cases/null-empty-inputs.test.ts`

### Fire-and-Forget Reliability
- Verify person summary fetch logs errors on failure (not silent `.catch(() => {})`)
- Verify embedNote logs errors on failure

**Test file:** `tests/edge-cases/fire-and-forget.test.ts`

### Type Boundary Transitions
- Note with type "person" but no PersonMeta row
- PersonMeta row with no corresponding note
- Changing a regular note's type to "person" or vice versa

**Test file:** `tests/edge-cases/type-boundaries.test.ts`

---

## Already-Suspected Bugs

From initial exploration, these are likely bugs to confirm during the sweep:

1. **PersonMeta orphaning on note delete** — DELETE `/api/notes/[id]` doesn't delete PersonMeta (Phase 3: cascade deletes)
2. **JSON.parse with no error handling** — `parseNote()`, `parsePersonMeta()`, `parseChatMessage()` crash on malformed data (Phase 3: JSON corruption)
3. **PendingPerson race condition** — check-then-create not atomic (Phase 3: race conditions)
4. **Silent fire-and-forget failures** — `.catch(() => {})` with no logging (Phase 3: fire-and-forget)
5. **Tool input casting without validation** — `block.input as Record<string, unknown>` in chat route (Phase 1: chat lifecycle)
6. **Conditional update failure not communicated** — organize returns `{ stale: true }` but unclear if client handles it (Phase 1: note lifecycle)

---

## Phase 4: Browser-Level Testing (Playwright)

After phases 1-3, install Playwright and run E2E tests against the running dev server to catch client-side bugs that lib/API tests can't reach.

### Setup
- Install `@playwright/test` as dev dependency
- Configure to run against `http://localhost:3000` (dev server must be running)
- Test config at `playwright.config.ts`

### Browser Tests
- **Note editing flow** — create note, type content, verify auto-save, check tag extraction
- **Slash command menu** — type `/`, verify menu appears, select command, verify execution
- **Person flow** — `/newperson` stepped flow, verify modal interactions
- **Chat mode** — switch via `/chatmode`, send message, verify response renders, switch back
- **Wiki-link behavior** — type `[[`, verify link decoration, click to navigate
- **Markdown preview** — verify markers hide on unfocused lines, show on active line
- **Command widgets** — `/claude` instruction display, confirmation rendering

**Test directory:** `tests/e2e/`

---

## Execution Strategy

- Phases run sequentially (1 -> 2 -> 3 -> 4)
- Within each phase, independent test files can be written in parallel
- Tests use the existing test infrastructure (`tests/setup.ts`, real SQLite DB)
- AI-dependent tests (organize, chat, command routes) will be tested at the lib layer where possible, mocking only the Anthropic API calls
- Phase 4 (Playwright) runs against the live dev server
- Every bug found gets added to the bug report immediately
- No code fixes until the report is complete and triaged
- Bug report committed only after all 4 phases complete
