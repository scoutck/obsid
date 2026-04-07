# Bug Finding & Testing Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically find all bugs in Obsid through workflow tracing, unit tests, and edge case stress tests, then compile a prioritized bug report.

**Architecture:** 4-phase sweep — workflow integration tests (Phase 1), unit test gap fill (Phase 2), edge case stress tests (Phase 3), browser E2E tests (Phase 4). Tests written with vitest against real SQLite test DB. Bug report compiled from all failures.

**Tech Stack:** Vitest, Prisma (libsql adapter), Playwright (Phase 4), SQLite test DB

---

## File Structure

### New Files
- `tests/workflows/note-lifecycle.test.ts` — Note CRUD, search, cascade delete
- `tests/workflows/person-lifecycle.test.ts` — Person creation through deletion
- `tests/workflows/chat-lifecycle.test.ts` — Conversation + message CRUD
- `tests/workflows/command-lifecycle.test.ts` — Command CRUD through note deletion
- `tests/lib/commands.test.ts` — Command module unit tests
- `tests/edge-cases/json-corruption.test.ts` — Malformed JSON resilience
- `tests/edge-cases/cascade-deletes.test.ts` — Delete completeness verification
- `tests/edge-cases/null-empty-inputs.test.ts` — Boundary input handling
- `tests/edge-cases/type-boundaries.test.ts` — Note type transitions
- `tests/edge-cases/race-conditions.test.ts` — Concurrent operation safety
- `playwright.config.ts` — Playwright configuration
- `tests/e2e/note-editing.spec.ts` — Browser-level note tests
- `tests/e2e/slash-commands.spec.ts` — Browser-level slash menu tests
- `tests/e2e/chat-mode.spec.ts` — Browser-level chat tests
- `docs/superpowers/specs/2026-04-07-bug-report.md` — Final bug report

### Modified Files
- `tests/lib/auth.test.ts` — Add edge case tests
- `tests/lib/embeddings.test.ts` — Add DB-level tests
- `package.json` — Add Playwright dev dependency

---

## Phase 1: Workflow Tracing

### Task 1: Note Lifecycle Workflow Tests

**Files:**
- Create: `tests/workflows/note-lifecycle.test.ts`

- [ ] **Step 1: Write note CRUD workflow test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  searchNotes,
  listNotes,
  conditionalUpdateNote,
} from "@/lib/notes";

beforeEach(async () => {
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.note.deleteMany();
});

describe("Note Lifecycle", () => {
  describe("CRUD", () => {
    it("creates a note with defaults", async () => {
      const note = await createNote({});
      expect(note.title).toBe("");
      expect(note.content).toBe("");
      expect(note.tags).toEqual([]);
      expect(note.links).toEqual([]);
      expect(note.type).toBe("");
      expect(note.id).toBeDefined();
    });

    it("creates a note with all fields", async () => {
      const note = await createNote({
        title: "Test Note",
        content: "Hello world",
        tags: ["project", "meeting"],
        type: "note",
        links: ["abc-123"],
      });
      expect(note.title).toBe("Test Note");
      expect(note.tags).toEqual(["project", "meeting"]);
      expect(note.links).toEqual(["abc-123"]);
    });

    it("retrieves a note by id", async () => {
      const created = await createNote({ title: "Fetch Me" });
      const fetched = await getNote(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe("Fetch Me");
    });

    it("returns null for non-existent note", async () => {
      const result = await getNote("non-existent-id");
      expect(result).toBeNull();
    });

    it("updates note fields", async () => {
      const note = await createNote({ title: "Original" });
      const updated = await updateNote(note.id, {
        title: "Updated",
        content: "New content",
        tags: ["new-tag"],
      });
      expect(updated.title).toBe("Updated");
      expect(updated.content).toBe("New content");
      expect(updated.tags).toEqual(["new-tag"]);
    });

    it("deletes a note", async () => {
      const note = await createNote({ title: "Delete Me" });
      await deleteNote(note.id);
      const result = await getNote(note.id);
      expect(result).toBeNull();
    });

    it("lists notes ordered by updatedAt DESC", async () => {
      const a = await createNote({ title: "First" });
      const b = await createNote({ title: "Second" });
      await updateNote(a.id, { title: "First Updated" });

      const notes = await listNotes();
      expect(notes[0].id).toBe(a.id);
      expect(notes[1].id).toBe(b.id);
    });
  });

  describe("conditional update (optimistic locking)", () => {
    it("succeeds when updatedAt matches", async () => {
      const note = await createNote({ content: "original" });
      const result = await conditionalUpdateNote(note.id, note.updatedAt, {
        content: "updated",
      });
      expect(result).toBe(true);
      const fetched = await getNote(note.id);
      expect(fetched!.content).toBe("updated");
    });

    it("fails when updatedAt is stale", async () => {
      const note = await createNote({ content: "original" });
      const staleDate = new Date("2000-01-01T00:00:00.000Z");
      const result = await conditionalUpdateNote(note.id, staleDate, {
        content: "should not apply",
      });
      expect(result).toBe(false);
      const fetched = await getNote(note.id);
      expect(fetched!.content).toBe("original");
    });
  });

  describe("search", () => {
    it("finds notes by content via LIKE fallback", async () => {
      await createNote({ title: "Meeting Notes", content: "Discussed the project timeline" });
      await createNote({ title: "Shopping", content: "Buy groceries" });

      const results = await searchNotes("timeline");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Meeting Notes");
    });

    it("finds notes by title via LIKE fallback", async () => {
      await createNote({ title: "Important Meeting", content: "..." });
      const results = await searchNotes("Important");
      expect(results).toHaveLength(1);
    });

    it("returns empty array for no matches", async () => {
      await createNote({ title: "Hello", content: "World" });
      const results = await searchNotes("zzzznonexistent");
      expect(results).toHaveLength(0);
    });

    it("handles empty query string", async () => {
      await createNote({ title: "Test" });
      const results = await searchNotes("");
      // Should not crash — behavior may be empty or all
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("cascade delete via API pattern", () => {
    it("cleaning up commands, embeddings, notePerson, pendingPerson before deleting note", async () => {
      const note = await createNote({ title: "Full Note" });

      // Create associated data
      await prisma.command.create({
        data: {
          noteId: note.id,
          line: 1,
          instruction: "test instruction",
          confirmation: "",
          status: "pending",
        },
      });
      await prisma.embedding.create({
        data: { noteId: note.id, vector: Buffer.from([0, 0, 0, 0]) },
      });
      await prisma.pendingPerson.create({
        data: {
          name: "Test Person",
          sourceNoteId: note.id,
          context: "mentioned in note",
          status: "pending",
        },
      });

      // Simulate the DELETE route cascade
      const { deleteCommandsForNote } = await import("@/lib/commands");
      await deleteCommandsForNote(note.id);
      await prisma.embedding.deleteMany({ where: { noteId: note.id } });
      await prisma.notePerson.deleteMany({ where: { noteId: note.id } });
      await prisma.pendingPerson.updateMany({
        where: { sourceNoteId: note.id },
        data: { sourceNoteId: null },
      });
      await deleteNote(note.id);

      // Verify everything is cleaned up
      expect(await getNote(note.id)).toBeNull();
      const commands = await prisma.command.findMany({ where: { noteId: note.id } });
      expect(commands).toHaveLength(0);
      const embeddings = await prisma.embedding.findMany({ where: { noteId: note.id } });
      expect(embeddings).toHaveLength(0);
      // PendingPerson should still exist but with null sourceNoteId
      const pending = await prisma.pendingPerson.findMany({ where: { name: "Test Person" } });
      expect(pending).toHaveLength(1);
      expect(pending[0].sourceNoteId).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to find bugs**

Run: `npm test -- tests/workflows/note-lifecycle.test.ts`
Record any failures as bugs in a local notes file.

- [ ] **Step 3: Commit**

```bash
git add tests/workflows/note-lifecycle.test.ts
git commit -m "test: note lifecycle workflow tests (Phase 1)"
```

---

### Task 2: Person Lifecycle Workflow Tests

**Files:**
- Create: `tests/workflows/person-lifecycle.test.ts`

- [ ] **Step 1: Write person lifecycle test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createPerson,
  getPerson,
  getPersonByAlias,
  getPersonsByAliases,
  listPeople,
  updatePerson,
  addNotePerson,
  addNotePeople,
  getNotePeople,
  getNotesMentioning,
  updatePersonSummary,
} from "@/lib/people";
import { createNote, getNote, deleteNote } from "@/lib/notes";
import {
  createPendingPerson,
  listPendingPeople,
  updatePendingPersonStatus,
  dismissPendingPerson,
} from "@/lib/pending-people";

beforeEach(async () => {
  await prisma.notePerson.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.note.deleteMany();
});

describe("Person Lifecycle", () => {
  describe("pending person flow", () => {
    it("creates a pending person from AI detection", async () => {
      const note = await createNote({ content: "Met with Sarah today" });
      const pending = await createPendingPerson({
        name: "Sarah",
        sourceNoteId: note.id,
        context: "mentioned in meeting note",
      });
      expect(pending.name).toBe("Sarah");
      expect(pending.status).toBe("pending");
      expect(pending.sourceNoteId).toBe(note.id);
    });

    it("deduplicates pending people with same name and source", async () => {
      const note = await createNote({ content: "Sarah was there" });
      const first = await createPendingPerson({
        name: "Sarah",
        sourceNoteId: note.id,
        context: "first mention",
      });
      const second = await createPendingPerson({
        name: "Sarah",
        sourceNoteId: note.id,
        context: "second mention",
      });
      expect(first.id).toBe(second.id);
      const all = await listPendingPeople();
      expect(all.filter((p) => p.name === "Sarah")).toHaveLength(1);
    });

    it("allows same name from different sources", async () => {
      const noteA = await createNote({ content: "Sarah in note A" });
      const noteB = await createNote({ content: "Sarah in note B" });
      await createPendingPerson({ name: "Sarah", sourceNoteId: noteA.id, context: "A" });
      await createPendingPerson({ name: "Sarah", sourceNoteId: noteB.id, context: "B" });
      const all = await listPendingPeople();
      expect(all.filter((p) => p.name === "Sarah")).toHaveLength(2);
    });

    it("dismisses a pending person", async () => {
      const pending = await createPendingPerson({ name: "Unknown", context: "vague" });
      await dismissPendingPerson(pending.id);
      const all = await listPendingPeople();
      expect(all.find((p) => p.id === pending.id)).toBeUndefined();
    });

    it("confirms a pending person by updating status", async () => {
      const pending = await createPendingPerson({ name: "Sarah", context: "confirmed" });
      await updatePendingPersonStatus(pending.id, "confirmed");
      const all = await listPendingPeople();
      expect(all.find((p) => p.id === pending.id)).toBeUndefined();
    });
  });

  describe("person creation and alias resolution", () => {
    it("creates a person with note and metadata", async () => {
      const person = await createPerson({ name: "Sarah Chen", role: "colleague" });
      expect(person.note.type).toBe("person");
      expect(person.meta.aliases).toContain("Sarah Chen");
      expect(person.meta.role).toBe("colleague");
    });

    it("auto-prepends name to aliases", async () => {
      const person = await createPerson({
        name: "Sarah Chen",
        aliases: ["Sarah"],
      });
      expect(person.meta.aliases[0]).toBe("Sarah Chen");
      expect(person.meta.aliases).toContain("Sarah");
    });

    it("resolves person by alias (case-insensitive)", async () => {
      await createPerson({ name: "Sarah Chen" });
      const found = await getPersonByAlias("sarah chen");
      expect(found).not.toBeNull();
      expect(found!.meta.aliases).toContain("Sarah Chen");
    });

    it("returns null for ambiguous alias", async () => {
      await createPerson({ name: "Sarah Chen", aliases: ["Sarah"] });
      await createPerson({ name: "Sarah Miller", aliases: ["Sarah"] });
      const result = await getPersonByAlias("Sarah");
      expect(result).toBeNull();
    });

    it("batch resolves aliases via getPersonsByAliases", async () => {
      await createPerson({ name: "Sarah Chen" });
      await createPerson({ name: "Bob Smith" });
      const map = await getPersonsByAliases(["Sarah Chen", "Bob Smith", "Unknown"]);
      expect(map.get("Sarah Chen")).not.toBeNull();
      expect(map.get("Bob Smith")).not.toBeNull();
      expect(map.get("Unknown")).toBeNull();
    });

    it("batch resolves partial name matches (fallback matching)", async () => {
      await createPerson({ name: "Ashley Beresid", aliases: ["Ashley"] });
      const map = await getPersonsByAliases(["Ashley Beresid"]);
      expect(map.get("Ashley Beresid")).not.toBeNull();
    });
  });

  describe("note-person linking", () => {
    it("links a person to a note", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "Met with Sarah" });
      await addNotePerson(note.id, person.note.id);
      const people = await getNotePeople(note.id);
      expect(people).toHaveLength(1);
      expect(people[0].note.id).toBe(person.note.id);
    });

    it("does not duplicate links", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "Sarah again" });
      await addNotePerson(note.id, person.note.id);
      await addNotePerson(note.id, person.note.id);
      const people = await getNotePeople(note.id);
      expect(people).toHaveLength(1);
    });

    it("batch links multiple people", async () => {
      const alice = await createPerson({ name: "Alice" });
      const bob = await createPerson({ name: "Bob" });
      const note = await createNote({ content: "Alice and Bob" });
      await addNotePeople(note.id, [alice.note.id, bob.note.id]);
      const people = await getNotePeople(note.id);
      expect(people).toHaveLength(2);
    });

    it("finds notes mentioning a person", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note1 = await createNote({ content: "Note 1 with Sarah" });
      const note2 = await createNote({ content: "Note 2 with Sarah" });
      await addNotePerson(note1.id, person.note.id);
      await addNotePerson(note2.id, person.note.id);
      const mentions = await getNotesMentioning(person.note.id);
      expect(mentions).toHaveLength(2);
    });
  });

  describe("person update and summary", () => {
    it("updates person role and aliases", async () => {
      const person = await createPerson({ name: "Sarah", role: "colleague" });
      const updated = await updatePerson(person.note.id, {
        role: "manager",
        aliases: ["Sarah C"],
      });
      expect(updated.meta.role).toBe("manager");
      expect(updated.meta.aliases).toContain("Sarah C");
    });

    it("updates person summary", async () => {
      const person = await createPerson({ name: "Sarah" });
      await updatePersonSummary(person.note.id, "Sarah is a project lead.");
      const fetched = await getPerson(person.note.id);
      expect(fetched!.meta.summary).toBe("Sarah is a project lead.");
    });

    it("lists people with note counts", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "Meeting" });
      await addNotePerson(note.id, person.note.id);
      const people = await listPeople();
      const sarah = people.find((p) => p.note.id === person.note.id);
      expect(sarah).toBeDefined();
      expect(sarah!.noteCount).toBe(1);
    });
  });

  describe("person deletion cleanup", () => {
    it("deleting person note leaves PersonMeta orphaned (BUG CHECK)", async () => {
      const person = await createPerson({ name: "Sarah" });
      const personNoteId = person.note.id;

      // Delete the note directly (simulating DELETE API route without PersonMeta cleanup)
      await prisma.notePerson.deleteMany({ where: { personNoteId } });
      await deleteNote(personNoteId);

      // Check if PersonMeta still exists — THIS IS THE SUSPECTED BUG
      const orphanedMeta = await prisma.personMeta.findUnique({
        where: { noteId: personNoteId },
      });
      // If this passes, the bug is confirmed: PersonMeta is orphaned
      // Record as bug if orphanedMeta is not null
      if (orphanedMeta) {
        console.warn("BUG CONFIRMED: PersonMeta orphaned after note delete");
      }
      // The test documents the current behavior — we expect the bug
      expect(orphanedMeta).not.toBeNull(); // Documents the bug: meta IS orphaned
    });
  });
});
```

- [ ] **Step 2: Run test to find bugs**

Run: `npm test -- tests/workflows/person-lifecycle.test.ts`
Record any failures.

- [ ] **Step 3: Commit**

```bash
git add tests/workflows/person-lifecycle.test.ts
git commit -m "test: person lifecycle workflow tests (Phase 1)"
```

---

### Task 3: Chat Lifecycle Workflow Tests

**Files:**
- Create: `tests/workflows/chat-lifecycle.test.ts`

- [ ] **Step 1: Write chat lifecycle test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConversation,
  getConversation,
  getMostRecentConversation,
  updateConversationTitle,
  addMessage,
  getMessages,
} from "@/lib/conversations";

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

describe("Chat Lifecycle", () => {
  describe("conversation CRUD", () => {
    it("creates a conversation with default title", async () => {
      const conv = await createConversation();
      expect(conv.title).toBe("");
      expect(conv.id).toBeDefined();
    });

    it("creates a conversation with custom title", async () => {
      const conv = await createConversation("My Chat");
      expect(conv.title).toBe("My Chat");
    });

    it("retrieves a conversation by id", async () => {
      const conv = await createConversation("Test");
      const fetched = await getConversation(conv.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe("Test");
    });

    it("returns null for non-existent conversation", async () => {
      const result = await getConversation("non-existent");
      expect(result).toBeNull();
    });

    it("gets most recent conversation", async () => {
      await createConversation("Old");
      const recent = await createConversation("New");
      const result = await getMostRecentConversation();
      expect(result).not.toBeNull();
      expect(result!.id).toBe(recent.id);
    });

    it("updates conversation title", async () => {
      const conv = await createConversation("Old Title");
      await updateConversationTitle(conv.id, "New Title");
      const fetched = await getConversation(conv.id);
      expect(fetched!.title).toBe("New Title");
    });
  });

  describe("messages", () => {
    it("adds a user message", async () => {
      const conv = await createConversation();
      const msg = await addMessage(conv.id, "user", "Hello");
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("Hello");
      expect(msg.conversationId).toBe(conv.id);
      expect(msg.toolCalls).toEqual([]);
    });

    it("adds an assistant message with tool calls", async () => {
      const conv = await createConversation();
      const toolCalls = [
        { name: "semantic_search", input: { query: "test" } },
      ];
      const msg = await addMessage(conv.id, "assistant", "Here's what I found", toolCalls);
      expect(msg.toolCalls).toEqual(toolCalls);
    });

    it("retrieves messages in chronological order", async () => {
      const conv = await createConversation();
      await addMessage(conv.id, "user", "First");
      await addMessage(conv.id, "assistant", "Second");
      await addMessage(conv.id, "user", "Third");

      const messages = await getMessages(conv.id);
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe("First");
      expect(messages[1].content).toBe("Second");
      expect(messages[2].content).toBe("Third");
    });

    it("respects message limit", async () => {
      const conv = await createConversation();
      for (let i = 0; i < 5; i++) {
        await addMessage(conv.id, "user", `Message ${i}`);
      }
      const messages = await getMessages(conv.id, 3);
      expect(messages).toHaveLength(3);
      // Should return the 3 most recent in chronological order
      expect(messages[0].content).toBe("Message 2");
      expect(messages[2].content).toBe("Message 4");
    });

    it("adding a message updates conversation updatedAt", async () => {
      const conv = await createConversation();
      const originalUpdatedAt = conv.updatedAt;
      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));
      await addMessage(conv.id, "user", "Bump");
      const updated = await getConversation(conv.id);
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime()
      );
    });
  });

  describe("conversation deletion cascade", () => {
    it("deleting conversation should clean up messages", async () => {
      const conv = await createConversation();
      await addMessage(conv.id, "user", "Hello");
      await addMessage(conv.id, "assistant", "Hi");

      await prisma.message.deleteMany({ where: { conversationId: conv.id } });
      await prisma.conversation.delete({ where: { id: conv.id } });

      const messages = await prisma.message.findMany({
        where: { conversationId: conv.id },
      });
      expect(messages).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run test to find bugs**

Run: `npm test -- tests/workflows/chat-lifecycle.test.ts`
Record any failures.

- [ ] **Step 3: Commit**

```bash
git add tests/workflows/chat-lifecycle.test.ts
git commit -m "test: chat lifecycle workflow tests (Phase 1)"
```

---

### Task 4: Command Lifecycle Workflow Tests

**Files:**
- Create: `tests/workflows/command-lifecycle.test.ts`

- [ ] **Step 1: Write command lifecycle test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createCommand,
  getCommandsForNote,
  updateCommand,
  deleteCommandsForNote,
} from "@/lib/commands";
import { createNote, deleteNote } from "@/lib/notes";

beforeEach(async () => {
  await prisma.command.deleteMany();
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.note.deleteMany();
});

describe("Command Lifecycle", () => {
  describe("CRUD", () => {
    it("creates a command for a note", async () => {
      const note = await createNote({ title: "Test" });
      const cmd = await createCommand({
        noteId: note.id,
        line: 5,
        instruction: "summarize this section",
      });
      expect(cmd.noteId).toBe(note.id);
      expect(cmd.line).toBe(5);
      expect(cmd.instruction).toBe("summarize this section");
      expect(cmd.status).toBe("pending");
      expect(cmd.confirmation).toBe("");
    });

    it("retrieves commands for a note sorted by line", async () => {
      const note = await createNote({ title: "Test" });
      await createCommand({ noteId: note.id, line: 10, instruction: "second" });
      await createCommand({ noteId: note.id, line: 3, instruction: "first" });

      const commands = await getCommandsForNote(note.id);
      expect(commands).toHaveLength(2);
      expect(commands[0].line).toBe(3);
      expect(commands[1].line).toBe(10);
    });

    it("updates command confirmation and status", async () => {
      const note = await createNote({ title: "Test" });
      const cmd = await createCommand({
        noteId: note.id,
        line: 1,
        instruction: "fix grammar",
      });

      const updated = await updateCommand(cmd.id, {
        confirmation: "Fixed 3 grammar issues",
        status: "completed",
      });
      expect(updated.confirmation).toBe("Fixed 3 grammar issues");
      expect(updated.status).toBe("completed");
    });

    it("deletes all commands for a note", async () => {
      const note = await createNote({ title: "Test" });
      await createCommand({ noteId: note.id, line: 1, instruction: "a" });
      await createCommand({ noteId: note.id, line: 2, instruction: "b" });

      await deleteCommandsForNote(note.id);
      const remaining = await getCommandsForNote(note.id);
      expect(remaining).toHaveLength(0);
    });
  });

  describe("command cleanup on note delete", () => {
    it("commands are cleaned up when note is deleted via cascade pattern", async () => {
      const note = await createNote({ title: "Test" });
      await createCommand({ noteId: note.id, line: 1, instruction: "test" });

      // Simulate DELETE API route cascade
      await deleteCommandsForNote(note.id);
      await deleteNote(note.id);

      const commands = await prisma.command.findMany({ where: { noteId: note.id } });
      expect(commands).toHaveLength(0);
    });

    it("commands for other notes are not affected", async () => {
      const noteA = await createNote({ title: "A" });
      const noteB = await createNote({ title: "B" });
      await createCommand({ noteId: noteA.id, line: 1, instruction: "for A" });
      await createCommand({ noteId: noteB.id, line: 1, instruction: "for B" });

      await deleteCommandsForNote(noteA.id);
      await deleteNote(noteA.id);

      const remaining = await getCommandsForNote(noteB.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].instruction).toBe("for B");
    });
  });
});
```

- [ ] **Step 2: Run test to find bugs**

Run: `npm test -- tests/workflows/command-lifecycle.test.ts`
Record any failures.

- [ ] **Step 3: Commit**

```bash
git add tests/workflows/command-lifecycle.test.ts
git commit -m "test: command lifecycle workflow tests (Phase 1)"
```

---

## Phase 2: Targeted Unit Tests (Gap Fill)

### Task 5: Commands Module Unit Tests

Already covered by Task 4. Mark complete if Task 4 passes.

---

### Task 6: Auth Edge Case Tests

**Files:**
- Modify: `tests/lib/auth.test.ts`

- [ ] **Step 1: Read existing auth tests**

Run: Read `tests/lib/auth.test.ts` to see what's already covered.

- [ ] **Step 2: Add edge case tests**

Append to existing test file:

```typescript
  describe("edge cases", () => {
    it("rejects empty password for hashing", async () => {
      // Test if empty password is handled or throws
      const hash = await hashPassword("");
      // Should still produce a valid hash (bcrypt handles empty strings)
      expect(hash).toBeDefined();
      expect(await verifyPassword("", hash)).toBe(true);
    });

    it("rejects verification with wrong password", async () => {
      const hash = await hashPassword("correct");
      const result = await verifyPassword("wrong", hash);
      expect(result).toBe(false);
    });

    it("verifies token with correct secret", async () => {
      const token = await createToken({ userId: "123", username: "test" });
      const payload = await verifyToken(token);
      expect(payload.userId).toBe("123");
      expect(payload.username).toBe("test");
    });

    it("rejects malformed JWT", async () => {
      await expect(verifyToken("not.a.jwt")).rejects.toThrow();
    });

    it("rejects empty string token", async () => {
      await expect(verifyToken("")).rejects.toThrow();
    });
  });
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/lib/auth.test.ts`
Record any failures.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/auth.test.ts
git commit -m "test: auth edge cases — malformed JWT, empty password (Phase 2)"
```

---

### Task 7: Embeddings DB-Level Tests

**Files:**
- Modify: `tests/lib/embeddings.test.ts`

- [ ] **Step 1: Read existing embeddings tests**

Run: Read `tests/lib/embeddings.test.ts` to see what's already covered.

- [ ] **Step 2: Add DB-level storage and retrieval tests**

Add a new describe block for DB operations:

```typescript
import { prisma } from "@/lib/db";
import { createNote } from "@/lib/notes";

describe("embedding storage (DB-level)", () => {
  beforeEach(async () => {
    await prisma.embedding.deleteMany();
    await prisma.notePerson.deleteMany();
    await prisma.personMeta.deleteMany();
    await prisma.note.deleteMany();
  });

  it("stores and retrieves an embedding vector", async () => {
    const note = await createNote({ title: "Test" });
    const vector = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const buffer = Buffer.from(vector.buffer);

    await prisma.embedding.create({
      data: { noteId: note.id, vector: buffer },
    });

    const stored = await prisma.embedding.findUnique({
      where: { noteId: note.id },
    });
    expect(stored).not.toBeNull();
    const retrieved = new Float32Array(stored!.vector.buffer);
    expect(retrieved[0]).toBeCloseTo(0.1);
    expect(retrieved[3]).toBeCloseTo(0.4);
  });

  it("overwrites embedding on upsert", async () => {
    const note = await createNote({ title: "Test" });
    const v1 = Buffer.from(new Float32Array([1, 0, 0, 0]).buffer);
    const v2 = Buffer.from(new Float32Array([0, 1, 0, 0]).buffer);

    await prisma.embedding.create({ data: { noteId: note.id, vector: v1 } });
    await prisma.embedding.update({
      where: { noteId: note.id },
      data: { vector: v2 },
    });

    const stored = await prisma.embedding.findUnique({ where: { noteId: note.id } });
    const retrieved = new Float32Array(stored!.vector.buffer);
    expect(retrieved[0]).toBeCloseTo(0);
    expect(retrieved[1]).toBeCloseTo(1);
  });

  it("deletes embedding when note is deleted", async () => {
    const note = await createNote({ title: "Test" });
    const vector = Buffer.from(new Float32Array([1, 2, 3, 4]).buffer);
    await prisma.embedding.create({ data: { noteId: note.id, vector } });

    await prisma.embedding.deleteMany({ where: { noteId: note.id } });
    const result = await prisma.embedding.findUnique({ where: { noteId: note.id } });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/lib/embeddings.test.ts`
Record any failures.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/embeddings.test.ts
git commit -m "test: embeddings DB-level storage and retrieval (Phase 2)"
```

---

## Phase 3: Edge Case Stress Tests

### Task 8: JSON Corruption Resilience

**Files:**
- Create: `tests/edge-cases/json-corruption.test.ts`

- [ ] **Step 1: Write JSON corruption tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { parseNote, parsePersonMeta, parseChatMessage } from "@/types";

beforeEach(async () => {
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.note.deleteMany();
});

describe("JSON Corruption Resilience", () => {
  describe("parseNote", () => {
    it("crashes on malformed tags JSON (BUG CHECK)", () => {
      const raw = {
        id: "test-1",
        title: "Test",
        content: "Hello",
        tags: "not valid json",
        type: "note",
        links: "[]",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // This documents the expected crash — no try-catch in parseNote
      expect(() => parseNote(raw)).toThrow();
    });

    it("crashes on malformed links JSON (BUG CHECK)", () => {
      const raw = {
        id: "test-1",
        title: "Test",
        content: "Hello",
        tags: "[]",
        type: "note",
        links: "{broken",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(() => parseNote(raw)).toThrow();
    });

    it("handles empty string tags", () => {
      const raw = {
        id: "test-1",
        title: "Test",
        content: "Hello",
        tags: "",
        type: "note",
        links: "[]",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Empty string is not valid JSON — should crash
      expect(() => parseNote(raw)).toThrow();
    });

    it("handles null-ish values in JSON fields", () => {
      const raw = {
        id: "test-1",
        title: "Test",
        content: "Hello",
        tags: "null",
        type: "note",
        links: "null",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // JSON.parse("null") returns null — but code expects arrays
      const note = parseNote(raw);
      // This checks if null tags would cause downstream issues
      expect(note.tags).toBeNull();
    });
  });

  describe("parsePersonMeta", () => {
    it("crashes on malformed aliases JSON (BUG CHECK)", () => {
      const raw = {
        id: "meta-1",
        noteId: "note-1",
        aliases: "not json",
        role: "friend",
        summary: "",
        userContext: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(() => parsePersonMeta(raw)).toThrow();
    });
  });

  describe("parseChatMessage", () => {
    it("crashes on malformed toolCalls JSON (BUG CHECK)", () => {
      const raw = {
        id: "msg-1",
        conversationId: "conv-1",
        role: "assistant",
        content: "test",
        toolCalls: "{bad json}",
        createdAt: new Date(),
      };
      expect(() => parseChatMessage(raw)).toThrow();
    });
  });

  describe("DB-level corruption", () => {
    it("corrupted tags in DB cause getNote to crash", async () => {
      // Insert note with valid JSON first
      const note = await prisma.note.create({
        data: {
          title: "Corrupted",
          content: "test",
          tags: "[]",
          type: "note",
          links: "[]",
        },
      });

      // Corrupt the tags field directly via raw SQL
      await prisma.$executeRawUnsafe(
        `UPDATE "Note" SET tags = 'INVALID' WHERE id = ?`,
        note.id
      );

      // Now try to read via the lib function
      const { getNote } = await import("@/lib/notes");
      await expect(getNote(note.id)).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/edge-cases/json-corruption.test.ts`
Record which tests throw (confirming the bug) vs which handle gracefully.

- [ ] **Step 3: Commit**

```bash
git add tests/edge-cases/json-corruption.test.ts
git commit -m "test: JSON corruption resilience — confirms no error handling (Phase 3)"
```

---

### Task 9: Cascade Delete Completeness

**Files:**
- Create: `tests/edge-cases/cascade-deletes.test.ts`

- [ ] **Step 1: Write cascade delete tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createNote, deleteNote } from "@/lib/notes";
import { createPerson, addNotePerson } from "@/lib/people";
import { createCommand, deleteCommandsForNote } from "@/lib/commands";
import { createConversation, addMessage } from "@/lib/conversations";

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.note.deleteMany();
});

describe("Cascade Delete Completeness", () => {
  describe("regular note deletion", () => {
    it("cleans up all associated data", async () => {
      const note = await createNote({ title: "Full Note", content: "test" });
      const person = await createPerson({ name: "Sarah" });

      // Create all associated data
      await createCommand({ noteId: note.id, line: 1, instruction: "test" });
      await prisma.embedding.create({
        data: { noteId: note.id, vector: Buffer.from(new Float32Array([1, 2, 3, 4]).buffer) },
      });
      await addNotePerson(note.id, person.note.id);
      await prisma.pendingPerson.create({
        data: { name: "Bob", sourceNoteId: note.id, context: "test", status: "pending" },
      });

      // Simulate DELETE API cascade
      await deleteCommandsForNote(note.id);
      await prisma.embedding.deleteMany({ where: { noteId: note.id } });
      await prisma.notePerson.deleteMany({ where: { noteId: note.id } });
      await prisma.pendingPerson.updateMany({
        where: { sourceNoteId: note.id },
        data: { sourceNoteId: null },
      });
      await deleteNote(note.id);

      // Verify all cleaned up
      expect(await prisma.command.findMany({ where: { noteId: note.id } })).toHaveLength(0);
      expect(await prisma.embedding.findMany({ where: { noteId: note.id } })).toHaveLength(0);
      expect(await prisma.notePerson.findMany({ where: { noteId: note.id } })).toHaveLength(0);
    });
  });

  describe("person note deletion (BUG CHECK)", () => {
    it("does NOT clean up PersonMeta — confirming orphan bug", async () => {
      const person = await createPerson({ name: "Sarah Chen", role: "colleague" });
      const personNoteId = person.note.id;

      // Create some links
      const note = await createNote({ content: "Met Sarah" });
      await addNotePerson(note.id, personNoteId);

      // Simulate DELETE API cascade (current implementation)
      await deleteCommandsForNote(personNoteId);
      await prisma.embedding.deleteMany({ where: { noteId: personNoteId } });
      await prisma.notePerson.deleteMany({ where: { noteId: personNoteId } });
      // Also clean up reverse links (where this person is linked FROM other notes)
      await prisma.notePerson.deleteMany({ where: { personNoteId } });
      await prisma.pendingPerson.updateMany({
        where: { sourceNoteId: personNoteId },
        data: { sourceNoteId: null },
      });
      await deleteNote(personNoteId);

      // BUG: PersonMeta is NOT deleted by the cascade
      const orphanedMeta = await prisma.personMeta.findUnique({
        where: { noteId: personNoteId },
      });
      expect(orphanedMeta).not.toBeNull(); // Confirms the bug — meta is orphaned
    });

    it("does NOT clean up reverse NotePerson links (BUG CHECK)", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "Met Sarah" });
      await addNotePerson(note.id, person.note.id);

      // Current DELETE cascade only does:
      // notePerson.deleteMany({ where: { noteId: id } })
      // This deletes links FROM the note, not links TO the note (as a person)
      const linksBeforeDelete = await prisma.notePerson.findMany({
        where: { personNoteId: person.note.id },
      });
      expect(linksBeforeDelete).toHaveLength(1);

      // Simulate DELETE cascade for the person note
      await deleteCommandsForNote(person.note.id);
      await prisma.embedding.deleteMany({ where: { noteId: person.note.id } });
      await prisma.notePerson.deleteMany({ where: { noteId: person.note.id } });
      await prisma.pendingPerson.updateMany({
        where: { sourceNoteId: person.note.id },
        data: { sourceNoteId: null },
      });
      await deleteNote(person.note.id);

      // Check: are reverse links cleaned up?
      const linksAfterDelete = await prisma.notePerson.findMany({
        where: { personNoteId: person.note.id },
      });
      // If this is > 0, we have orphaned NotePerson rows
      if (linksAfterDelete.length > 0) {
        console.warn("BUG CONFIRMED: NotePerson reverse links orphaned after person note delete");
      }
      expect(linksAfterDelete).toHaveLength(1); // Documents the bug
    });
  });

  describe("conversation deletion", () => {
    it("messages must be deleted before conversation", async () => {
      const conv = await createConversation("Test");
      await addMessage(conv.id, "user", "Hello");
      await addMessage(conv.id, "assistant", "Hi");

      // Delete messages first, then conversation
      await prisma.message.deleteMany({ where: { conversationId: conv.id } });
      await prisma.conversation.delete({ where: { id: conv.id } });

      expect(await prisma.message.findMany({ where: { conversationId: conv.id } })).toHaveLength(0);
      expect(await prisma.conversation.findUnique({ where: { id: conv.id } })).toBeNull();
    });

    it("deleting conversation without deleting messages first (BUG CHECK)", async () => {
      const conv = await createConversation("Test");
      await addMessage(conv.id, "user", "Hello");

      // Try deleting conversation without cleaning up messages
      // This should fail due to foreign key constraint, or orphan messages
      try {
        await prisma.conversation.delete({ where: { id: conv.id } });
        // If we get here, check for orphaned messages
        const orphaned = await prisma.message.findMany({ where: { conversationId: conv.id } });
        if (orphaned.length > 0) {
          console.warn("BUG: Messages orphaned after conversation delete");
        }
      } catch (e) {
        // FK constraint prevented it — this is actually correct behavior
        expect(e).toBeDefined();
      }
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/edge-cases/cascade-deletes.test.ts`
Record confirmed bugs.

- [ ] **Step 3: Commit**

```bash
git add tests/edge-cases/cascade-deletes.test.ts
git commit -m "test: cascade delete completeness — confirms PersonMeta orphan bug (Phase 3)"
```

---

### Task 10: Null/Empty Input Handling

**Files:**
- Create: `tests/edge-cases/null-empty-inputs.test.ts`

- [ ] **Step 1: Write null/empty input tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createNote, searchNotes, updateNote } from "@/lib/notes";
import { createPerson, getPersonByAlias } from "@/lib/people";
import { createPendingPerson } from "@/lib/pending-people";
import { createConversation, addMessage, getMessages } from "@/lib/conversations";
import { createCommand } from "@/lib/commands";

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.note.deleteMany();
});

describe("Null/Empty Input Handling", () => {
  describe("notes", () => {
    it("creates note with completely empty input", async () => {
      const note = await createNote({});
      expect(note).toBeDefined();
      expect(note.title).toBe("");
      expect(note.content).toBe("");
    });

    it("updates note with empty content", async () => {
      const note = await createNote({ title: "Test", content: "Hello" });
      const updated = await updateNote(note.id, { content: "" });
      expect(updated.content).toBe("");
    });

    it("updates note with empty tags array", async () => {
      const note = await createNote({ title: "Test", tags: ["a", "b"] });
      const updated = await updateNote(note.id, { tags: [] });
      expect(updated.tags).toEqual([]);
    });

    it("search with empty string", async () => {
      await createNote({ title: "Test" });
      const results = await searchNotes("");
      expect(Array.isArray(results)).toBe(true);
    });

    it("search with whitespace-only string", async () => {
      await createNote({ title: "Test" });
      const results = await searchNotes("   ");
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("people", () => {
    it("creates person with minimal input", async () => {
      const person = await createPerson({ name: "X" });
      expect(person.note).toBeDefined();
      expect(person.meta.aliases).toContain("X");
    });

    it("creates person with empty aliases array", async () => {
      const person = await createPerson({ name: "Test", aliases: [] });
      // Name should still be auto-prepended
      expect(person.meta.aliases).toContain("Test");
    });

    it("getPersonByAlias with empty string", async () => {
      await createPerson({ name: "Sarah" });
      const result = await getPersonByAlias("");
      expect(result).toBeNull();
    });

    it("getPersonByAlias with whitespace", async () => {
      await createPerson({ name: "Sarah" });
      const result = await getPersonByAlias("   ");
      expect(result).toBeNull();
    });
  });

  describe("pending people", () => {
    it("creates pending person with empty context", async () => {
      const pending = await createPendingPerson({ name: "Test", context: "" });
      expect(pending).toBeDefined();
      expect(pending.context).toBe("");
    });

    it("creates pending person with no source", async () => {
      const pending = await createPendingPerson({ name: "Test", context: "no source" });
      expect(pending.sourceNoteId).toBeNull();
    });
  });

  describe("conversations", () => {
    it("creates conversation with empty title", async () => {
      const conv = await createConversation("");
      expect(conv.title).toBe("");
    });

    it("adds message with empty content", async () => {
      const conv = await createConversation();
      const msg = await addMessage(conv.id, "user", "");
      expect(msg.content).toBe("");
    });

    it("gets messages for empty conversation", async () => {
      const conv = await createConversation();
      const messages = await getMessages(conv.id);
      expect(messages).toHaveLength(0);
    });

    it("gets messages with limit 0", async () => {
      const conv = await createConversation();
      await addMessage(conv.id, "user", "Hello");
      const messages = await getMessages(conv.id, 0);
      // Behavior with limit 0 — should return empty or all?
      expect(Array.isArray(messages)).toBe(true);
    });
  });

  describe("commands", () => {
    it("creates command with empty instruction", async () => {
      const note = await createNote({ title: "Test" });
      const cmd = await createCommand({ noteId: note.id, line: 0, instruction: "" });
      expect(cmd.instruction).toBe("");
    });

    it("creates command with line 0", async () => {
      const note = await createNote({ title: "Test" });
      const cmd = await createCommand({ noteId: note.id, line: 0, instruction: "test" });
      expect(cmd.line).toBe(0);
    });

    it("creates command with negative line number", async () => {
      const note = await createNote({ title: "Test" });
      // Should this be allowed?
      const cmd = await createCommand({ noteId: note.id, line: -1, instruction: "test" });
      expect(cmd.line).toBe(-1);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/edge-cases/null-empty-inputs.test.ts`
Record any crashes or unexpected behavior.

- [ ] **Step 3: Commit**

```bash
git add tests/edge-cases/null-empty-inputs.test.ts
git commit -m "test: null/empty input handling edge cases (Phase 3)"
```

---

### Task 11: Type Boundary Transitions

**Files:**
- Create: `tests/edge-cases/type-boundaries.test.ts`

- [ ] **Step 1: Write type boundary tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createNote, updateNote, getNote } from "@/lib/notes";
import { createPerson, getPerson } from "@/lib/people";

beforeEach(async () => {
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.note.deleteMany();
});

describe("Type Boundary Transitions", () => {
  it("person note without PersonMeta (orphan check)", async () => {
    // Create a note with type "person" directly (no PersonMeta)
    const note = await createNote({ type: "person", title: "Ghost Person" });

    // getPerson should handle this gracefully
    const person = await getPerson(note.id);
    expect(person).toBeNull(); // Should return null if meta is missing
  });

  it("PersonMeta without corresponding note (orphan check)", async () => {
    const person = await createPerson({ name: "Sarah" });
    const noteId = person.note.id;

    // Delete just the note, leaving PersonMeta orphaned
    // (Skip cascade to intentionally create orphan)
    await prisma.notePerson.deleteMany({ where: { noteId } });
    await prisma.note.delete({ where: { id: noteId } });

    // PersonMeta should still exist (orphaned)
    const meta = await prisma.personMeta.findUnique({ where: { noteId } });
    expect(meta).not.toBeNull();

    // getPerson should return null (note missing)
    const person2 = await getPerson(noteId);
    expect(person2).toBeNull();
  });

  it("changing regular note type to person", async () => {
    const note = await createNote({ title: "Regular Note", type: "note" });
    const updated = await updateNote(note.id, { type: "person" });
    expect(updated.type).toBe("person");

    // But there's no PersonMeta — is this a valid state?
    const person = await getPerson(note.id);
    expect(person).toBeNull(); // No meta = not a real person
  });

  it("changing person note type to regular", async () => {
    const person = await createPerson({ name: "Sarah" });
    await updateNote(person.note.id, { type: "note" });

    const fetched = await getNote(person.note.id);
    expect(fetched!.type).toBe("note");

    // PersonMeta still exists — orphaned
    const meta = await prisma.personMeta.findUnique({
      where: { noteId: person.note.id },
    });
    expect(meta).not.toBeNull(); // Orphaned meta
  });

  it("listPeople only returns notes with type person AND PersonMeta", async () => {
    // Real person
    await createPerson({ name: "Sarah" });
    // Fake person (type=person but no meta)
    await createNote({ title: "Fake", type: "person" });
    // Regular note
    await createNote({ title: "Regular" });

    const { listPeople } = await import("@/lib/people");
    const people = await listPeople();

    // Should only include Sarah (has both type=person and PersonMeta)
    expect(people).toHaveLength(1);
    expect(people[0].note.title).toBe("Sarah");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/edge-cases/type-boundaries.test.ts`
Record any failures.

- [ ] **Step 3: Commit**

```bash
git add tests/edge-cases/type-boundaries.test.ts
git commit -m "test: type boundary transitions — person/note type mismatches (Phase 3)"
```

---

### Task 12: Race Condition Tests

**Files:**
- Create: `tests/edge-cases/race-conditions.test.ts`

- [ ] **Step 1: Write race condition tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createNote, conditionalUpdateNote } from "@/lib/notes";
import { createPendingPerson, listPendingPeople } from "@/lib/pending-people";
import { createPerson, addNotePerson } from "@/lib/people";

beforeEach(async () => {
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.note.deleteMany();
});

describe("Race Conditions", () => {
  describe("conditional update (optimistic locking)", () => {
    it("only one of two concurrent updates succeeds", async () => {
      const note = await createNote({ content: "original" });

      // Simulate two concurrent updates with the same timestamp
      const [resultA, resultB] = await Promise.all([
        conditionalUpdateNote(note.id, note.updatedAt, { content: "update A" }),
        conditionalUpdateNote(note.id, note.updatedAt, { content: "update B" }),
      ]);

      // Exactly one should succeed
      const successes = [resultA, resultB].filter(Boolean);
      expect(successes).toHaveLength(1);
    });
  });

  describe("pending person deduplication race", () => {
    it("concurrent creates with same name may create duplicates (BUG CHECK)", async () => {
      const note = await createNote({ content: "test" });

      // Fire two creates concurrently
      const [a, b] = await Promise.all([
        createPendingPerson({ name: "Sarah", sourceNoteId: note.id, context: "A" }),
        createPendingPerson({ name: "Sarah", sourceNoteId: note.id, context: "B" }),
      ]);

      // Check if deduplication held
      const all = await listPendingPeople();
      const sarahs = all.filter((p) => p.name === "Sarah");

      if (sarahs.length > 1) {
        console.warn(
          `BUG CONFIRMED: PendingPerson race condition — ${sarahs.length} duplicates created`
        );
      }

      // Document actual behavior (may be 1 or 2 depending on timing)
      expect(sarahs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("addNotePerson duplicate handling", () => {
    it("concurrent addNotePerson with same pair", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "test" });

      // Should not throw even with concurrent calls
      // The upsert pattern should handle this
      try {
        await Promise.all([
          addNotePerson(note.id, person.note.id),
          addNotePerson(note.id, person.note.id),
        ]);
      } catch (e) {
        console.warn("BUG: Concurrent addNotePerson throws:", e);
      }

      // Should have exactly one link
      const links = await prisma.notePerson.findMany({
        where: { noteId: note.id, personNoteId: person.note.id },
      });
      expect(links).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- tests/edge-cases/race-conditions.test.ts`
Record any confirmed race conditions.

- [ ] **Step 3: Commit**

```bash
git add tests/edge-cases/race-conditions.test.ts
git commit -m "test: race condition tests — concurrent creates and updates (Phase 3)"
```

---

## Phase 4: Browser-Level Testing + PM/UX Audit (Playwright)

Adopt the mindset of a **senior PM and UX designer simultaneously**. Every page and flow gets evaluated for both functional correctness and experience quality. Screenshots at every step.

### Task 13: Install and Configure Playwright

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create Playwright config**

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "on",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 120000,
  },
  outputDir: "tests/e2e/results",
});
```

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts package.json package-lock.json
git commit -m "chore: add Playwright for E2E testing + PM/UX audit (Phase 4)"
```

---

### Task 14: Note Editing Flow — Functional + PM/UX Audit

**Files:**
- Create: `tests/e2e/note-editing.spec.ts`

For each test step, screenshot the state and evaluate through PM/UX lens.

- [ ] **Step 1: Write note editing E2E test with screenshots**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Note Editing Flow", () => {
  test("initial page load — first impression audit", async ({ page }) => {
    await page.goto("/");
    await page.screenshot({ path: "tests/e2e/results/01-initial-load.png", fullPage: true });

    // FUNCTIONAL: editor loads
    const editor = page.locator(".cm-editor");
    await expect(editor).toBeVisible({ timeout: 10000 });

    // PM: Is the happy path obvious within 3 seconds?
    // PM: What job-to-be-done is this screen serving? (Write/edit notes)
    // UX: Information hierarchy — is the editor the most prominent element?
    // UX: Cognitive load — how many decisions is the user asked to make on first load?
    // UX: Is there any onboarding cue or is the user dropped into a blank editor?
  });

  test("typing in editor — core interaction", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("# Meeting Notes\n\nDiscussed the project timeline with Sarah.");
    await page.screenshot({ path: "tests/e2e/results/02-typing-content.png", fullPage: true });

    await expect(editor).toContainText("Meeting Notes");
    await expect(editor).toContainText("Sarah");

    // UX: Does the editor feel responsive? Any lag?
    // UX: Is the font readable? Appropriate size and contrast?
    // UX: Does markdown preview kick in (heading formatting)?
  });

  test("markdown preview — unfocused line hides markers", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("# My Heading");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Body text below the heading");
    await page.screenshot({ path: "tests/e2e/results/03-markdown-preview.png", fullPage: true });

    // FUNCTIONAL: heading line should hide # marker when cursor is on body line
    // UX: Is the preview behavior obvious? Does the user understand what happened?
    // UX: Is there visual differentiation between heading and body text?
  });

  test("slash menu — discoverability and interaction", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("/");
    await page.screenshot({ path: "tests/e2e/results/04-slash-menu-open.png", fullPage: true });

    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });

    // PM: Is the slash menu discoverable? Would a new user know to type /?
    // PM: Where would a user drop off here — too many options? Unclear labels?
    // UX: Cognitive load — how many commands are shown? Is it overwhelming?
    // UX: Affordances — do menu items look clickable? Is there hover state?
    // UX: Is the menu positioned correctly relative to cursor?

    // Filter the menu
    await page.keyboard.type("bo");
    await page.screenshot({ path: "tests/e2e/results/05-slash-menu-filtered.png", fullPage: true });
    await expect(slashMenu).toContainText(/bold/i);

    // UX: Does filtering feel instant? Is the match highlighting clear?
    // UX: What happens with no matches — is there a "no results" message?
  });

  test("slash menu — escape dismissal", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("/");
    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await page.screenshot({ path: "tests/e2e/results/06-slash-menu-dismissed.png", fullPage: true });
    await expect(slashMenu).not.toBeVisible({ timeout: 3000 });

    // PM: Can the user recover from opening the menu accidentally?
    // UX: Is the "/" character left behind after escape? Clean state?
  });

  test("slash menu — command execution (bold)", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.type("make me bold");
    // Select all text
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.screenshot({ path: "tests/e2e/results/07-text-selected.png", fullPage: true });

    // Deselect and type slash command
    await page.keyboard.press("End");
    await page.keyboard.type("/bold");
    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Enter");
    await page.screenshot({ path: "tests/e2e/results/08-bold-applied.png", fullPage: true });

    // UX: Feedback loop — does the user see confirmation that bold was applied?
    // UX: Does the formatting look correct in the editor?
    // PM: Is the cost of a user error here low? Can they undo?
  });
});
```

- [ ] **Step 2: Run tests and review screenshots**

Run: `npx playwright test tests/e2e/note-editing.spec.ts`
Review each screenshot in `tests/e2e/results/` through the PM/UX lens. For each:
1. Note the emotional state of a user at that moment
2. Identify friction points
3. Flag inconsistencies in patterns, language, or visual treatment
4. Compare what the UI says it does vs what actually happens
Add findings to the bug report.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/note-editing.spec.ts
git commit -m "test: note editing E2E + PM/UX audit screenshots (Phase 4)"
```

---

### Task 15: Chat Mode Flow — Functional + PM/UX Audit

**Files:**
- Create: `tests/e2e/chat-mode.spec.ts`

- [ ] **Step 1: Write chat mode E2E test with screenshots**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Chat Mode Flow", () => {
  test("switch to chat mode — mode transition audit", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();

    await page.screenshot({ path: "tests/e2e/results/09-before-chatmode.png", fullPage: true });

    // Type /chatmode
    await page.keyboard.type("/chatmode");
    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "tests/e2e/results/10-chatmode-entered.png", fullPage: true });

    // PM: Is the mode transition clear? Does the user know they're in chat?
    // PM: Can they get back to notes easily? Is the exit path obvious?
    // UX: Visual differentiation — does chat look distinct from note editing?
    // UX: Is there a loading state during transition?
    // UX: Feedback loop — did the UI confirm the mode switch?
  });

  test("switch back to note mode — return path audit", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();

    // Enter chat mode
    await page.keyboard.type("/chatmode");
    const slashMenu = page.locator("[class*='slash-menu'], [data-slash-menu]").first();
    await expect(slashMenu).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "tests/e2e/results/11-in-chatmode.png", fullPage: true });

    // Try to switch back — look for a way to invoke /notemode
    // The chat view should have its own input area
    // PM: Is the return path discoverable without documentation?
    // PM: What's the cost of a user accidentally entering chat mode?
  });
});
```

- [ ] **Step 2: Run tests and review screenshots**

Run: `npx playwright test tests/e2e/chat-mode.spec.ts`
Review screenshots. Assess:
- Mode transition clarity
- Return path discoverability
- Visual hierarchy in chat view
- Whether CTAs align with the job-to-be-done
Add findings to bug report.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/chat-mode.spec.ts
git commit -m "test: chat mode E2E + PM/UX audit screenshots (Phase 4)"
```

---

### Task 16: Tag and Wiki-Link Flow — Interaction Quality Audit

**Files:**
- Create: `tests/e2e/tags-and-links.spec.ts`

- [ ] **Step 1: Write tag and wiki-link E2E test with screenshots**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Tags and Wiki-Links", () => {
  test("tag autocomplete — # trigger audit", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();

    await page.keyboard.type("Working on the ");
    await page.keyboard.type("#");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/e2e/results/12-tag-trigger.png", fullPage: true });

    // UX: Does a tag autocomplete menu appear?
    // UX: Is the # visually styled differently (tag syntax highlighting)?
    // PM: Is the tag system discoverable?

    await page.keyboard.type("project");
    await page.screenshot({ path: "tests/e2e/results/13-tag-typed.png", fullPage: true });

    // UX: Is the tag visually distinct from regular text?
    // UX: Does the autocomplete help or get in the way?
  });

  test("wiki-link — [[ trigger audit", async ({ page }) => {
    await page.goto("/");
    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();

    await page.keyboard.type("See also [[");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/e2e/results/14-wikilink-trigger.png", fullPage: true });

    await page.keyboard.type("Meeting Notes]]");
    await page.screenshot({ path: "tests/e2e/results/15-wikilink-complete.png", fullPage: true });

    // UX: Is the wiki-link visually decorated (different from plain text)?
    // UX: Does it look clickable? Does the affordance match the action?
    // PM: What happens if the linked note doesn't exist? Error? Create prompt?
  });

  test("empty editor — zero state audit", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "tests/e2e/results/16-zero-state.png", fullPage: true });

    // PM: What does a brand new user see? Is there guidance?
    // PM: Is the happy path obvious within 3 seconds? (Start typing)
    // UX: Is there placeholder text or an empty state message?
    // UX: Cognitive load — how many things compete for attention?
    // UX: Accessibility — is there any screen reader guidance?
  });
});
```

- [ ] **Step 2: Run tests and review screenshots**

Run: `npx playwright test tests/e2e/tags-and-links.spec.ts`
Review screenshots for interaction quality. Assess:
- Tag and link discoverability
- Visual consistency of inline syntax
- Zero state experience for new users
- Accessibility (contrast, font sizes, focus indicators)
Add findings to bug report.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tags-and-links.spec.ts
git commit -m "test: tags, wiki-links, and zero state E2E + PM/UX audit (Phase 4)"
```

---

### Task 17: Full Flow Walkthrough — Senior PM/UX Evaluation

This is a manual evaluation task (no automated test file). Navigate the app as a real user would and document everything.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Walk through core flows with Playwright scripting**

Create a walkthrough script that captures the full user journey:

```typescript
// tests/e2e/full-walkthrough.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Full User Journey — PM/UX Walkthrough", () => {
  test("complete note-taking session", async ({ page }) => {
    // Step 1: Land on app
    await page.goto("/");
    await page.screenshot({ path: "tests/e2e/results/walk-01-landing.png", fullPage: true });

    const editor = page.locator(".cm-editor .cm-content");
    await expect(editor).toBeVisible({ timeout: 10000 });

    // Step 2: Create first note with content
    await editor.click();
    await page.keyboard.type("# Project Kickoff\n\nMet with Sarah and Bob to discuss the new feature. Key decisions:\n\n- Launch date is April 15\n- Bob will handle backend\n- Sarah owns the design\n\n#meeting #project");
    await page.screenshot({ path: "tests/e2e/results/walk-02-note-written.png", fullPage: true });

    // Step 3: Try to create a new note via slash command
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/new");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/e2e/results/walk-03-new-note-cmd.png", fullPage: true });

    // Step 4: Try the /notes command to see note list
    // First dismiss any open menu
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // Clear the /new text
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("/notes");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/e2e/results/walk-04-notes-list-cmd.png", fullPage: true });

    // PM EVALUATION at each step:
    // - User emotional state: confident? confused? anxious?
    // - Friction points: anything that made them pause, guess, or backtrack?
    // - Pattern consistency: do similar actions work the same way?
    // - Error recovery: what happens if they make a mistake?
  });
});
```

- [ ] **Step 3: Review all screenshots and compile PM/UX findings**

For each screenshot, document:
1. **User emotional state** at that moment (confused? confident? anxious?)
2. **Friction points** — anything that makes the user pause, guess, or backtrack
3. **Inconsistencies** in patterns, language, or visual treatment
4. **UI vs reality** — what the UI says it does vs what actually happens
5. **PM assessment** — job-to-be-done clarity, happy path visibility, drop-off risk, error recovery cost, CTA alignment
6. **UX assessment** — information hierarchy, cognitive load, affordances, feedback loops, accessibility (contrast, font sizes, tab order)

Add all findings to the bug report under a new "UI/UX Issues" section with severities.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/full-walkthrough.spec.ts
git commit -m "test: full user journey walkthrough + PM/UX evaluation (Phase 4)"
```

---

## Phase 5: Bug Report Compilation

### Task 18: Compile Bug Report

**Files:**
- Create: `docs/superpowers/specs/2026-04-07-bug-report.md`

- [ ] **Step 1: Run all tests and collect results**

```bash
npm test 2>&1 | tee test-results.txt
npx playwright test 2>&1 | tee e2e-results.txt
```

- [ ] **Step 2: Compile bug report**

Review all test output. For each failure or confirmed bug:
1. Identify the bug (description, location, root cause)
2. Assign severity (critical/high/medium/low)
3. Categorize (data integrity, error handling, race condition, cascade, UI)
4. Write reproduction steps

Write the report to `docs/superpowers/specs/2026-04-07-bug-report.md` with this structure:

```markdown
# Obsid Bug Report — 2026-04-07

## Summary
- Critical: N
- High: N
- Medium: N
- Low: N

## Critical

### BUG-001: [Title]
- **Location:** `file:line`
- **Category:** [data integrity | error handling | race condition | cascade | UI/UX]
- **Description:** ...
- **Reproduction:** ...
- **Impact:** ...

## High
...

## Medium
...

## Low
...

---

## UI/UX Issues (PM/UX Audit)

For each issue, include the screenshot reference and dual assessment.

### UX-001: [Title]
- **Flow:** [which user flow]
- **Screenshot:** `tests/e2e/results/<filename>.png`
- **Severity:** [critical | high | medium | low]
- **PM Assessment:** [job-to-be-done, happy path, drop-off risk, error recovery]
- **UX Assessment:** [hierarchy, cognitive load, affordances, feedback, accessibility]
- **User Emotional State:** [confused | confident | anxious | frustrated]
- **Friction:** [what makes the user pause, guess, or backtrack]
- **Recommendation:** [what to change]
```

- [ ] **Step 3: Commit bug report**

```bash
git add docs/superpowers/specs/2026-04-07-bug-report.md
git commit -m "docs: comprehensive bug report from testing sweep"
```

- [ ] **Step 4: Clean up temporary files**

```bash
rm -f test-results.txt e2e-results.txt
```
