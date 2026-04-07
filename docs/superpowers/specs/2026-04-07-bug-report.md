# Obsid Bug Report — 2026-04-07

## Summary
- **Critical:** 1
- **High:** 3
- **Medium:** 4
- **Low:** 3

**Test coverage:** 170 tests (169 pass, 1 fail). 23 test files across 5 directories.

---

## Critical

### BUG-001: conditionalUpdateNote always returns false
- **Location:** `src/lib/notes.ts` — `conditionalUpdateNote()`
- **Category:** data integrity
- **Description:** The optimistic locking function `conditionalUpdateNote` always returns `false`, even when the provided `updatedAt` timestamp exactly matches the database value. The raw SQL `WHERE` clause compares timestamps, but the format written by Prisma (`@updatedAt` as ISO string like `2026-04-05T22:00:00.123Z`) doesn't match the format used in the comparison query. This effectively **disables optimistic locking entirely**.
- **Reproduction:**
  1. Create a note via `createNote()`
  2. Immediately call `conditionalUpdateNote(note.id, note.updatedAt, { content: "new" })`
  3. Returns `false` — update is rejected despite matching timestamp
- **Impact:** The AI organize system uses conditional updates to discard stale results. With this bug, **every organize result is silently discarded** — organize never actually saves its work. This is the core AI feature broken silently.
- **Test:** `tests/workflows/note-lifecycle.test.ts` — "succeeds when updatedAt matches"
- **Also confirmed in:** `tests/edge-cases/race-conditions.test.ts` — 0 of 2 concurrent updates succeed

---

## High

### BUG-002: PersonMeta orphaned when person note is deleted
- **Location:** `src/app/api/notes/[id]/route.ts` — DELETE handler
- **Category:** data integrity / cascade
- **Description:** When a person note is deleted, the cascade cleanup deletes commands, embeddings, notePerson links, and nullifies pendingPerson references — but does NOT delete the `PersonMeta` row. The PersonMeta remains in the database with a `noteId` pointing to a deleted note.
- **Reproduction:**
  1. Create a person via `createPerson({ name: "Sarah" })`
  2. Delete the person's note
  3. Query `prisma.personMeta.findUnique({ where: { noteId } })` — still exists
- **Impact:** Orphaned PersonMeta rows accumulate over time. If a new note reuses the same ID (unlikely with UUIDs but possible), it could inherit stale person metadata.
- **Test:** `tests/workflows/person-lifecycle.test.ts` — "deleting person note leaves PersonMeta orphaned"
- **Test:** `tests/edge-cases/cascade-deletes.test.ts` — "does NOT clean up PersonMeta"

### BUG-003: Reverse NotePerson links orphaned on person note delete
- **Location:** `src/app/api/notes/[id]/route.ts` — DELETE handler
- **Category:** data integrity / cascade
- **Description:** The DELETE cascade runs `notePerson.deleteMany({ where: { noteId } })` which only removes links **FROM** the note. When a person note is deleted, links **TO** that person (i.e., `{ where: { personNoteId } }`) are NOT cleaned up. Other notes still reference the deleted person.
- **Reproduction:**
  1. Create a person, create a note, link the note to the person
  2. Delete the person note using the cascade pattern
  3. Query `notePerson.findMany({ where: { personNoteId } })` — orphaned rows remain
- **Impact:** `getNotePeople()` for notes that linked to the deleted person may return stale/broken references. Could cause crashes if code tries to follow the link to a non-existent note.
- **Test:** `tests/edge-cases/cascade-deletes.test.ts` — "does NOT clean up reverse NotePerson links"

### BUG-004: No JSON error handling in parse functions
- **Location:** `src/types/index.ts` — `parseNote()`, `parsePersonMeta()`, `parseChatMessage()`
- **Category:** error handling
- **Description:** All three parse functions call `JSON.parse()` on database string fields (`tags`, `links`, `aliases`, `toolCalls`) with zero error handling. If any field contains malformed JSON (empty string, corrupted data, `null` text), the entire function throws an unhandled error, crashing the caller.
- **Reproduction:**
  1. Corrupt a note's `tags` field via raw SQL: `UPDATE "Note" SET tags = 'INVALID' WHERE id = ?`
  2. Call `getNote(id)` — throws `SyntaxError: Unexpected token`
- **Impact:** A single corrupted row makes an entire note unreadable. `listNotes()` would crash if any note has corrupted JSON. No graceful degradation — the app crashes rather than showing a fallback.
- **Test:** `tests/edge-cases/json-corruption.test.ts` — all 7 tests confirm crash behavior

---

## Medium

### BUG-005: Markdown bullet lists render incorrectly in live preview
- **Location:** `src/editor/markdown-preview.ts` or CodeMirror GFM configuration
- **Category:** UI rendering
- **Description:** Markdown bullet lists using `- ` syntax render with em-dash (`—`) characters instead of bullet points. List continuation creates double-dash `— —` prefixes on subsequent items. The live preview converts hyphen-space to em-dash, breaking list formatting.
- **Reproduction:**
  1. Type `- Item one` then Enter, `- Item two` then Enter, `- Item three`
  2. Observe: items show as `— Item one`, `— — Item two`, `— — Item three`
- **Impact:** Markdown lists — a core writing feature — look broken. Users see em-dashes instead of proper bullet formatting.
- **Screenshot:** `tests/e2e/results/walk-02-note-written.png`

### BUG-006: Chat mode markdown not rendered
- **Location:** `src/components/ChatView.tsx`
- **Category:** UI rendering
- **Description:** Claude's responses in chat mode display raw markdown markers (`**bold**`) instead of rendered formatted text. The chat view does not parse or render markdown in message content.
- **Reproduction:**
  1. Switch to chat mode via `/chatmode`
  2. Ask Claude a question that produces formatted output
  3. Observe: `**bold**` text appears with literal asterisks
- **Impact:** Chat responses are harder to read. Key information that Claude bolds for emphasis blends into surrounding text.
- **Screenshot:** `tests/e2e/results/10-chatmode-entered.png`

### BUG-007: Note titles show raw `#` prefix in Open Note modal
- **Location:** `src/components/` — note list/search modal component
- **Category:** UI display
- **Description:** Some notes in the Open Note search modal show `# Title` with the markdown heading marker as part of the title, instead of just `Title`. This happens when the note's `title` field is empty and the first line of content starts with `# `.
- **Reproduction:**
  1. Open slash menu → "Open Note"
  2. Observe notes like "# 1:1 with Sarah Chen" showing the `#` prefix
- **Impact:** Inconsistent visual display. Some notes show clean titles, others show markdown artifacts.
- **Screenshot:** `tests/e2e/results/walk-04-notes-list.png`

### BUG-008: Slash menu `/` character persists after Escape
- **Location:** `src/editor/slash-commands.ts` or Editor component
- **Category:** UI interaction
- **Description:** When the slash menu is opened by typing `/` and then dismissed with Escape, the `/` character remains in the note content. The user must manually delete it.
- **Reproduction:**
  1. Click in editor, type `/`
  2. Slash menu appears
  3. Press Escape
  4. `/` character remains in the text
- **Impact:** Minor friction — user must backspace to clean up after accidental slash menu invocation. Adds unnecessary editing steps.
- **Screenshot:** `tests/e2e/results/06-slash-menu-dismissed.png`

---

## Low

### BUG-009: No validation on command line numbers
- **Location:** `src/lib/commands.ts` — `createCommand()`
- **Category:** input validation
- **Description:** `createCommand()` accepts negative line numbers without validation. Line `-1` is stored in the database and returned by queries.
- **Reproduction:** `await createCommand({ noteId, line: -1, instruction: "test" })` — succeeds
- **Impact:** Low. Commands are created programmatically by the AI system, not user input. But a defensive check would prevent edge case bugs.
- **Test:** `tests/edge-cases/null-empty-inputs.test.ts` — "creates command with negative line number"

### BUG-010: parseNote returns null for `"null"` JSON string
- **Location:** `src/types/index.ts` — `parseNote()`
- **Category:** data integrity
- **Description:** If a note's `tags` field contains the string `"null"` (valid JSON), `JSON.parse("null")` returns `null` instead of an array. Downstream code expecting `tags` to be an array (e.g., `tags.map()`, `tags.includes()`) would crash.
- **Reproduction:** Set tags field to string `"null"`, call `parseNote()`, access `note.tags.length` — TypeError
- **Impact:** Low probability but could crash if data corruption occurs.
- **Test:** `tests/edge-cases/json-corruption.test.ts` — "handles null-ish values in JSON fields"

### BUG-011: Type change leaves orphaned PersonMeta
- **Location:** `src/lib/notes.ts` — `updateNote()`
- **Category:** data integrity
- **Description:** Changing a note's `type` from `"person"` to `"note"` via `updateNote()` does not clean up the associated `PersonMeta` row. The PersonMeta remains orphaned.
- **Reproduction:**
  1. Create a person via `createPerson()`
  2. `updateNote(personNoteId, { type: "note" })`
  3. PersonMeta still exists with old noteId
- **Impact:** Low. Type changes are not a common user action. `listPeople()` correctly filters by JOIN so orphaned meta doesn't appear in people lists.
- **Test:** `tests/edge-cases/type-boundaries.test.ts` — "changing person note type to regular"

---

## UI/UX Issues (PM/UX Audit)

### UX-001: Zero state — no onboarding or guidance
- **Flow:** First app launch
- **Screenshot:** `tests/e2e/results/01-initial-load.png`
- **Severity:** medium
- **PM Assessment:** The happy path (start typing) is not obvious within 3 seconds. A brand new user faces a completely blank page with no instructions, no placeholder text, no tutorial. The only interactive element is a blank editor.
- **UX Assessment:** Minimal cognitive load (nothing to parse), but zero affordances. No placeholder text like "Start typing or press / for commands." No onboarding tooltip. Screen reader users get no guidance.
- **User Emotional State:** confused/uncertain
- **Friction:** "What do I do?" — user must discover `/` command system on their own
- **Recommendation:** Add placeholder text or a subtle onboarding message. Even "Type / for commands" would dramatically improve first-use experience.

### UX-002: Chat mode return path not discoverable
- **Flow:** Chat mode → back to notes
- **Screenshot:** `tests/e2e/results/10-chatmode-entered.png`
- **Severity:** medium
- **PM Assessment:** Accidentally entering chat mode has high recovery cost. The only way back is typing `/notemode` in the chat input, which requires prior knowledge. No visible button, link, or keyboard shortcut to return.
- **UX Assessment:** The tiny "chat" label at the top is the only mode indicator. No breadcrumb, no back button, no escape hatch. Information hierarchy doesn't communicate that this is a modal state.
- **User Emotional State:** anxious (if accidentally entered)
- **Friction:** "How do I get back?" — requires documentation knowledge
- **Recommendation:** Add a visible "Back to Notes" button or allow Escape key to return to note mode.

### UX-003: Slash menu command count is overwhelming
- **Flow:** Note editing → type `/`
- **Screenshot:** `tests/e2e/results/04-slash-menu-open.png`
- **Severity:** low
- **PM Assessment:** 20+ commands shown at once. Good categorization (Formatting, Notes, Organization, AI, Mode) helps, but the initial visual impact is dense. New users may feel overwhelmed.
- **UX Assessment:** Category headers help scanning. Each item has description text. Filtering works well. But no search hint is shown — users don't know they can type to filter.
- **User Emotional State:** slightly overwhelmed on first encounter
- **Friction:** Visual density on first open
- **Recommendation:** Consider showing fewer items initially with a "Show all" option, or add a search hint like "Type to filter..."

### UX-004: Login page — minimal but functional
- **Flow:** Authentication
- **Screenshot:** `tests/e2e/results/01-login-page.png`
- **Severity:** low
- **PM Assessment:** Clean, focused login form. "Have an invite code? Sign up" clearly communicates the invite-only model. Job-to-be-done is clear.
- **UX Assessment:** Good information hierarchy. Dark theme is consistent. Form fields have placeholder labels. No error state visible (would need to test invalid login).
- **User Emotional State:** confident
- **Friction:** None — standard login flow
- **Recommendation:** No changes needed. Consider showing error messages inline rather than in alerts.
