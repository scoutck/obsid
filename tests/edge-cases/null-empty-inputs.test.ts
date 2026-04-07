// @vitest-environment node
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
