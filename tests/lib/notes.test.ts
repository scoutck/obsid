// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
  searchByTags,
  getNotesByPerson,
  getNoteGraph,
  searchByTimeframe,
} from "@/lib/notes";
import { createPerson, addNotePerson } from "@/lib/people";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.userInsight.deleteMany();
  await prisma.task.deleteMany();
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

describe("searchByTags", () => {
  it("finds notes matching a tag", async () => {
    await createNote({ title: "Work note", tags: ["work", "meeting"] });
    await createNote({ title: "Personal note", tags: ["personal"] });
    await createNote({ title: "Another work note", tags: ["work"] });

    const results = await searchByTags(["work"]);
    expect(results).toHaveLength(2);
    expect(results.map((n) => n.title)).toContain("Work note");
    expect(results.map((n) => n.title)).toContain("Another work note");
  });

  it("returns empty for non-existent tag", async () => {
    await createNote({ title: "Some note", tags: ["existing"] });
    const results = await searchByTags(["nonexistent"]);
    expect(results).toHaveLength(0);
  });

  it("deduplicates when note matches multiple tags", async () => {
    await createNote({ title: "Multi-tag", tags: ["work", "meeting"] });
    await createNote({ title: "Only work", tags: ["work"] });

    const results = await searchByTags(["work", "meeting"]);
    // "Multi-tag" matches both tags but should appear only once
    expect(results).toHaveLength(2);
    const titles = results.map((n) => n.title);
    expect(titles).toContain("Multi-tag");
    expect(titles).toContain("Only work");
  });

  it("returns empty for empty tags array", async () => {
    await createNote({ title: "Some note", tags: ["work"] });
    const results = await searchByTags([]);
    expect(results).toHaveLength(0);
  });
});

describe("getNotesByPerson", () => {
  it("finds notes linked to a person by alias", async () => {
    const person = await createPerson({ name: "Alice Smith", aliases: ["Alice"] });
    const note1 = await createNote({ title: "Meeting with Alice" });
    const note2 = await createNote({ title: "Alice's birthday" });
    await createNote({ title: "Unrelated note" });

    await addNotePerson(note1.id, person.note.id);
    await addNotePerson(note2.id, person.note.id);

    const results = await getNotesByPerson("Alice");
    expect(results).toHaveLength(2);
    expect(results.map((n) => n.title)).toContain("Meeting with Alice");
    expect(results.map((n) => n.title)).toContain("Alice's birthday");
  });

  it("returns empty for unknown person", async () => {
    const results = await getNotesByPerson("Nobody");
    expect(results).toHaveLength(0);
  });

  it("resolves by full name", async () => {
    const person = await createPerson({ name: "Bob Jones" });
    const note = await createNote({ title: "Bob's project" });
    await addNotePerson(note.id, person.note.id);

    const results = await getNotesByPerson("Bob Jones");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Bob's project");
  });
});

describe("getNoteGraph", () => {
  it("returns root note at depth 0", async () => {
    const root = await createNote({ title: "Root", content: "No links here" });
    const graph = await getNoteGraph(root.id);
    expect(graph).toHaveLength(1);
    expect(graph[0].note.id).toBe(root.id);
    expect(graph[0].depth).toBe(0);
  });

  it("follows wiki-links at depth 1", async () => {
    const linked = await createNote({ title: "Linked Note", content: "target" });
    const root = await createNote({
      title: "Root",
      content: "See [[Linked Note]] for details",
    });

    const graph = await getNoteGraph(root.id, 1);
    expect(graph).toHaveLength(2);
    expect(graph[0].depth).toBe(0);
    expect(graph[0].note.id).toBe(root.id);
    expect(graph[1].depth).toBe(1);
    expect(graph[1].note.id).toBe(linked.id);
  });

  it("follows links to depth 2", async () => {
    const c = await createNote({ title: "C", content: "end of chain" });
    const b = await createNote({ title: "B", content: "links to [[C]]" });
    const a = await createNote({ title: "A", content: "links to [[B]]" });

    const graph = await getNoteGraph(a.id, 2);
    expect(graph).toHaveLength(3);
    expect(graph.find((e) => e.note.id === a.id)?.depth).toBe(0);
    expect(graph.find((e) => e.note.id === b.id)?.depth).toBe(1);
    expect(graph.find((e) => e.note.id === c.id)?.depth).toBe(2);
  });

  it("respects depth limit", async () => {
    const c = await createNote({ title: "C", content: "end of chain" });
    await createNote({ title: "B", content: "links to [[C]]" });
    const a = await createNote({ title: "A", content: "links to [[B]]" });

    const graph = await getNoteGraph(a.id, 1);
    // Should only include A (depth 0) and B (depth 1), not C
    expect(graph).toHaveLength(2);
    expect(graph.find((e) => e.note.id === c.id)).toBeUndefined();
  });

  it("avoids cycles", async () => {
    // Create two notes that link to each other
    const noteA = await createNote({ title: "CycleA", content: "links to [[CycleB]]" });
    await updateNote(noteA.id, { content: "links to [[CycleB]]" });
    const noteB = await createNote({ title: "CycleB", content: "links to [[CycleA]]" });

    const graph = await getNoteGraph(noteA.id, 5);
    expect(graph).toHaveLength(2);
    expect(graph.find((e) => e.note.id === noteA.id)?.depth).toBe(0);
    expect(graph.find((e) => e.note.id === noteB.id)?.depth).toBe(1);
  });

  it("returns empty for non-existent note", async () => {
    const graph = await getNoteGraph("nonexistent-id");
    expect(graph).toHaveLength(0);
  });
});

describe("searchByTimeframe", () => {
  it("finds notes within the time range", async () => {
    const note = await createNote({ title: "Recent note" });
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const results = await searchByTimeframe(oneHourAgo, oneHourFromNow);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.map((n) => n.id)).toContain(note.id);
  });

  it("returns empty for a time range in the distant past", async () => {
    await createNote({ title: "Current note" });
    const distantPast = new Date("2020-01-01T00:00:00Z");
    const distantPastEnd = new Date("2020-01-02T00:00:00Z");

    const results = await searchByTimeframe(distantPast, distantPastEnd);
    expect(results).toHaveLength(0);
  });

  it("orders results by updatedAt desc", async () => {
    const note1 = await createNote({ title: "First" });
    // Small delay to ensure different updatedAt
    const note2 = await createNote({ title: "Second" });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const results = await searchByTimeframe(oneHourAgo, oneHourFromNow);
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Second should come first (more recent)
    const idx1 = results.findIndex((n) => n.id === note1.id);
    const idx2 = results.findIndex((n) => n.id === note2.id);
    expect(idx2).toBeLessThan(idx1);
  });
});
