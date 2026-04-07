// @vitest-environment node
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
