import { describe, it, expect, beforeEach } from "vitest";
import {
  createPerson,
  getPersonByAlias,
  getPersonsByAliases,
  listPeople,
  addNotePerson,
  addNotePeople,
  getNotePeople,
  getNotesMentioning,
} from "@/lib/people";
import { createNote } from "@/lib/notes";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.note.deleteMany();
});

describe("createPerson", () => {
  it("creates a person note and PersonMeta", async () => {
    const person = await createPerson({
      name: "Sarah Chen",
      aliases: ["Sarah", "Sarah C."],
      role: "Engineering Manager",
    });
    expect(person.note.title).toBe("Sarah Chen");
    expect(person.note.type).toBe("person");
    expect(person.meta.aliases).toEqual(["Sarah Chen", "Sarah", "Sarah C."]);
    expect(person.meta.role).toBe("Engineering Manager");
  });

  it("auto-includes name in aliases", async () => {
    const person = await createPerson({ name: "John Doe" });
    expect(person.meta.aliases).toContain("John Doe");
  });
});

describe("getPersonByAlias", () => {
  it("finds person by exact alias match (case-insensitive)", async () => {
    await createPerson({ name: "Sarah Chen", aliases: ["Sarah C."] });
    const found = await getPersonByAlias("sarah c.");
    expect(found).not.toBeNull();
    expect(found!.note.title).toBe("Sarah Chen");
  });

  it("returns null for no match", async () => {
    const found = await getPersonByAlias("Nobody");
    expect(found).toBeNull();
  });

  it("returns null when alias matches multiple people", async () => {
    await createPerson({ name: "Sarah Chen", aliases: ["Sarah"] });
    await createPerson({ name: "Sarah Miller", aliases: ["Sarah"] });
    const found = await getPersonByAlias("Sarah");
    expect(found).toBeNull();
  });
});

describe("listPeople", () => {
  it("returns all people with note counts", async () => {
    const sarah = await createPerson({ name: "Sarah Chen" });
    const john = await createPerson({ name: "John Doe" });

    const meetingNote = await createNote({ title: "Meeting" });
    await addNotePerson(meetingNote.id, sarah.note.id);
    await addNotePerson(meetingNote.id, john.note.id);

    const people = await listPeople();
    expect(people).toHaveLength(2);
    const sarahEntry = people.find((p) => p.note.title === "Sarah Chen");
    expect(sarahEntry!.noteCount).toBe(1);
  });
});

describe("addNotePerson / getNotePeople", () => {
  it("links a note to a person and retrieves the link", async () => {
    const person = await createPerson({ name: "Sarah Chen" });
    const note = await createNote({ title: "Meeting notes" });
    await addNotePerson(note.id, person.note.id);

    const people = await getNotePeople(note.id);
    expect(people).toHaveLength(1);
    expect(people[0].note.title).toBe("Sarah Chen");
  });

  it("ignores duplicate links", async () => {
    const person = await createPerson({ name: "Sarah Chen" });
    const note = await createNote({ title: "Meeting" });
    await addNotePerson(note.id, person.note.id);
    await addNotePerson(note.id, person.note.id);

    const people = await getNotePeople(note.id);
    expect(people).toHaveLength(1);
  });
});

describe("getNotesMentioning", () => {
  it("returns all notes that mention a person", async () => {
    const person = await createPerson({ name: "Sarah Chen" });
    const note1 = await createNote({ title: "Meeting 1" });
    const note2 = await createNote({ title: "Meeting 2" });
    await addNotePerson(note1.id, person.note.id);
    await addNotePerson(note2.id, person.note.id);

    const notes = await getNotesMentioning(person.note.id);
    expect(notes).toHaveLength(2);
  });
});

describe("getPersonsByAliases", () => {
  it("resolves multiple aliases in one call", async () => {
    await createPerson({ name: "Sarah Chen", aliases: ["Sarah"] });
    await createPerson({ name: "John Doe", aliases: ["John"] });

    const results = await getPersonsByAliases(["sarah", "John Doe", "Nobody"]);
    expect(results.get("sarah")?.note.title).toBe("Sarah Chen");
    expect(results.get("John Doe")?.note.title).toBe("John Doe");
    expect(results.get("Nobody")).toBeNull();
  });
});

describe("addNotePeople", () => {
  it("batch links multiple people to a note", async () => {
    const sarah = await createPerson({ name: "Sarah Chen" });
    const john = await createPerson({ name: "John Doe" });
    const note = await createNote({ title: "Meeting" });

    await addNotePeople(note.id, [sarah.note.id, john.note.id]);
    const people = await getNotePeople(note.id);
    expect(people).toHaveLength(2);
  });

  it("skips duplicates", async () => {
    const sarah = await createPerson({ name: "Sarah Chen" });
    const note = await createNote({ title: "Meeting" });

    await addNotePerson(note.id, sarah.note.id);
    await addNotePeople(note.id, [sarah.note.id]);
    const people = await getNotePeople(note.id);
    expect(people).toHaveLength(1);
  });
});
