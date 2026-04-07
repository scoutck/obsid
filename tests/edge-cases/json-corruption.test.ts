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
    it("gracefully handles malformed tags JSON (BUG-004 fixed)", () => {
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
      const note = parseNote(raw);
      expect(note.tags).toEqual([]);
    });

    it("gracefully handles malformed links JSON (BUG-004 fixed)", () => {
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
      const note = parseNote(raw);
      expect(note.links).toEqual([]);
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
      const note = parseNote(raw);
      expect(note.tags).toEqual([]);
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
      const note = parseNote(raw);
      expect(note.tags).toEqual([]);
      expect(note.links).toEqual([]);
    });
  });

  describe("parsePersonMeta", () => {
    it("gracefully handles malformed aliases JSON (BUG-004 fixed)", () => {
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
      const meta = parsePersonMeta(raw);
      expect(meta.aliases).toEqual([]);
    });
  });

  describe("parseChatMessage", () => {
    it("gracefully handles malformed toolCalls JSON (BUG-004 fixed)", () => {
      const raw = {
        id: "msg-1",
        conversationId: "conv-1",
        role: "assistant",
        content: "test",
        toolCalls: "{bad json}",
        createdAt: new Date(),
      };
      const msg = parseChatMessage(raw);
      expect(msg.toolCalls).toEqual([]);
    });
  });

  describe("DB-level corruption", () => {
    it("corrupted tags in DB gracefully return empty array (BUG-004 fixed)", async () => {
      const note = await prisma.note.create({
        data: {
          title: "Corrupted",
          content: "test",
          tags: "[]",
          type: "note",
          links: "[]",
        },
      });

      await prisma.$executeRawUnsafe(
        `UPDATE "Note" SET tags = 'INVALID' WHERE id = ?`,
        note.id
      );

      const { getNote } = await import("@/lib/notes");
      const fetched = await getNote(note.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.tags).toEqual([]);
    });
  });
});
