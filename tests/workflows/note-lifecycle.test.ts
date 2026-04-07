// @vitest-environment node
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
      await new Promise((r) => setTimeout(r, 20));
      const b = await createNote({ title: "Second" });
      await new Promise((r) => setTimeout(r, 20));
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
        data: { noteId: note.id, vector: Uint8Array.from([0, 0, 0, 0]), model: "test" },
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
