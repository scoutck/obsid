// @vitest-environment node
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
