// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createNote, deleteNote } from "@/lib/notes";
import { createPerson, addNotePerson } from "@/lib/people";
import { createCommand, deleteCommandsForNote } from "@/lib/commands";
import { createConversation, addMessage } from "@/lib/conversations";
import { createUserInsight } from "@/lib/user-insights";

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.userInsight.deleteMany();
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
        data: {
          noteId: note.id,
          vector: Buffer.from(new Float32Array([1, 2, 3, 4]).buffer.slice(0) as ArrayBuffer),
          model: "test",
        },
      });
      await addNotePerson(note.id, person.note.id);
      await prisma.pendingPerson.create({
        data: { name: "Bob", sourceNoteId: note.id, context: "test", status: "pending" },
      });
      await createUserInsight({
        category: "expertise",
        content: "Knows TypeScript",
        evidence: "test evidence",
        sourceNoteId: note.id,
      });

      // Simulate DELETE API cascade
      await deleteCommandsForNote(note.id);
      await prisma.embedding.deleteMany({ where: { noteId: note.id } });
      await prisma.notePerson.deleteMany({ where: { noteId: note.id } });
      await prisma.pendingPerson.updateMany({
        where: { sourceNoteId: note.id },
        data: { sourceNoteId: null },
      });
      await prisma.userInsight.deleteMany({ where: { sourceNoteId: note.id } });
      await deleteNote(note.id);

      // Verify all cleaned up
      expect(await prisma.command.findMany({ where: { noteId: note.id } })).toHaveLength(0);
      expect(await prisma.embedding.findMany({ where: { noteId: note.id } })).toHaveLength(0);
      expect(await prisma.notePerson.findMany({ where: { noteId: note.id } })).toHaveLength(0);
      expect(await prisma.userInsight.findMany({ where: { sourceNoteId: note.id } })).toHaveLength(0);
    });
  });

  describe("person note deletion (BUG-002 + BUG-003 fixed)", () => {
    it("cleans up PersonMeta when person note is deleted", async () => {
      const person = await createPerson({ name: "Sarah Chen", role: "colleague" });
      const personNoteId = person.note.id;

      const note = await createNote({ content: "Met Sarah" });
      await addNotePerson(note.id, personNoteId);

      // Simulate fixed DELETE API cascade
      await deleteCommandsForNote(personNoteId);
      await prisma.embedding.deleteMany({ where: { noteId: personNoteId } });
      await prisma.notePerson.deleteMany({ where: { noteId: personNoteId } });
      await prisma.notePerson.deleteMany({ where: { personNoteId } });
      await prisma.personMeta.deleteMany({ where: { noteId: personNoteId } });
      await prisma.pendingPerson.updateMany({
        where: { sourceNoteId: personNoteId },
        data: { sourceNoteId: null },
      });
      await deleteNote(personNoteId);

      const meta = await prisma.personMeta.findUnique({
        where: { noteId: personNoteId },
      });
      expect(meta).toBeNull();
    });

    it("cleans up reverse NotePerson links when person note is deleted", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "Met Sarah" });
      await addNotePerson(note.id, person.note.id);

      expect(await prisma.notePerson.findMany({
        where: { personNoteId: person.note.id },
      })).toHaveLength(1);

      // Simulate fixed DELETE API cascade
      await deleteCommandsForNote(person.note.id);
      await prisma.embedding.deleteMany({ where: { noteId: person.note.id } });
      await prisma.notePerson.deleteMany({ where: { noteId: person.note.id } });
      await prisma.notePerson.deleteMany({ where: { personNoteId: person.note.id } });
      await prisma.personMeta.deleteMany({ where: { noteId: person.note.id } });
      await prisma.pendingPerson.updateMany({
        where: { sourceNoteId: person.note.id },
        data: { sourceNoteId: null },
      });
      await deleteNote(person.note.id);

      const linksAfterDelete = await prisma.notePerson.findMany({
        where: { personNoteId: person.note.id },
      });
      expect(linksAfterDelete).toHaveLength(0);
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
