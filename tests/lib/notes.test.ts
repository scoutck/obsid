import { describe, it, expect, beforeEach } from "vitest";
import {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
} from "@/lib/notes";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.note.deleteMany();
});

describe("createNote", () => {
  it("creates a note with default values", async () => {
    const note = await createNote({});
    expect(note.id).toBeDefined();
    expect(note.title).toBe("");
    expect(note.content).toBe("");
    expect(note.tags).toEqual([]);
    expect(note.links).toEqual([]);
  });

  it("creates a note with provided content", async () => {
    const note = await createNote({
      title: "Test Note",
      content: "# Test Note\n\nSome content here.",
      tags: ["test", "example"],
      type: "idea",
    });
    expect(note.title).toBe("Test Note");
    expect(note.content).toBe("# Test Note\n\nSome content here.");
    expect(note.tags).toEqual(["test", "example"]);
    expect(note.type).toBe("idea");
  });
});

describe("getNote", () => {
  it("returns a note by id", async () => {
    const created = await createNote({ title: "Find me" });
    const found = await getNote(created.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Find me");
  });

  it("returns null for non-existent id", async () => {
    const found = await getNote("nonexistent-id");
    expect(found).toBeNull();
  });
});

describe("updateNote", () => {
  it("updates note content", async () => {
    const note = await createNote({ title: "Original" });
    const updated = await updateNote(note.id, {
      title: "Updated",
      content: "New content",
    });
    expect(updated.title).toBe("Updated");
    expect(updated.content).toBe("New content");
  });

  it("updates tags", async () => {
    const note = await createNote({ tags: ["old"] });
    const updated = await updateNote(note.id, { tags: ["new", "tags"] });
    expect(updated.tags).toEqual(["new", "tags"]);
  });
});

describe("deleteNote", () => {
  it("deletes a note", async () => {
    const note = await createNote({ title: "Delete me" });
    await deleteNote(note.id);
    const found = await getNote(note.id);
    expect(found).toBeNull();
  });
});

describe("listNotes", () => {
  it("returns all notes ordered by updatedAt desc", async () => {
    await createNote({ title: "First" });
    await createNote({ title: "Second" });
    const notes = await listNotes();
    expect(notes).toHaveLength(2);
    expect(notes[0].title).toBe("Second");
  });
});
