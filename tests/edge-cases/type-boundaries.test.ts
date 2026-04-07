// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createNote, updateNote, getNote } from "@/lib/notes";
import { createPerson, getPerson, listPeople } from "@/lib/people";

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

    const people = await listPeople();

    // Should only include Sarah (has both type=person and PersonMeta)
    expect(people).toHaveLength(1);
    expect(people[0].note.title).toBe("Sarah");
  });
});
