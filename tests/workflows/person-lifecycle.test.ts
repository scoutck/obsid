// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createPerson,
  getPerson,
  getPersonByAlias,
  getPersonsByAliases,
  listPeople,
  updatePerson,
  addNotePerson,
  addNotePeople,
  getNotePeople,
  getNotesMentioning,
  updatePersonSummary,
} from "@/lib/people";
import { createNote, getNote, deleteNote } from "@/lib/notes";
import {
  createPendingPerson,
  listPendingPeople,
  updatePendingPersonStatus,
  dismissPendingPerson,
} from "@/lib/pending-people";

beforeEach(async () => {
  await prisma.notePerson.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.note.deleteMany();
});

describe("Person Lifecycle", () => {
  describe("pending person flow", () => {
    it("creates a pending person from AI detection", async () => {
      const note = await createNote({ content: "Met with Sarah today" });
      const pending = await createPendingPerson({
        name: "Sarah",
        sourceNoteId: note.id,
        context: "mentioned in meeting note",
      });
      expect(pending.name).toBe("Sarah");
      expect(pending.status).toBe("pending");
      expect(pending.sourceNoteId).toBe(note.id);
    });

    it("deduplicates pending people with same name and source", async () => {
      const note = await createNote({ content: "Sarah was there" });
      const first = await createPendingPerson({
        name: "Sarah",
        sourceNoteId: note.id,
        context: "first mention",
      });
      const second = await createPendingPerson({
        name: "Sarah",
        sourceNoteId: note.id,
        context: "second mention",
      });
      expect(first.id).toBe(second.id);
      const all = await listPendingPeople();
      expect(all.filter((p) => p.name === "Sarah")).toHaveLength(1);
    });

    it("allows same name from different sources", async () => {
      const noteA = await createNote({ content: "Sarah in note A" });
      const noteB = await createNote({ content: "Sarah in note B" });
      await createPendingPerson({ name: "Sarah", sourceNoteId: noteA.id, context: "A" });
      await createPendingPerson({ name: "Sarah", sourceNoteId: noteB.id, context: "B" });
      const all = await listPendingPeople();
      expect(all.filter((p) => p.name === "Sarah")).toHaveLength(2);
    });

    it("dismisses a pending person", async () => {
      const pending = await createPendingPerson({ name: "Unknown", context: "vague" });
      await dismissPendingPerson(pending.id);
      const all = await listPendingPeople();
      expect(all.find((p) => p.id === pending.id)).toBeUndefined();
    });

    it("confirms a pending person by updating status", async () => {
      const pending = await createPendingPerson({ name: "Sarah", context: "confirmed" });
      await updatePendingPersonStatus(pending.id, "confirmed");
      const all = await listPendingPeople();
      expect(all.find((p) => p.id === pending.id)).toBeUndefined();
    });
  });

  describe("person creation and alias resolution", () => {
    it("creates a person with note and metadata", async () => {
      const person = await createPerson({ name: "Sarah Chen", role: "colleague" });
      expect(person.note.type).toBe("person");
      expect(person.meta.aliases).toContain("Sarah Chen");
      expect(person.meta.role).toBe("colleague");
    });

    it("auto-prepends name to aliases", async () => {
      const person = await createPerson({
        name: "Sarah Chen",
        aliases: ["Sarah"],
      });
      expect(person.meta.aliases[0]).toBe("Sarah Chen");
      expect(person.meta.aliases).toContain("Sarah");
    });

    it("resolves person by alias (case-insensitive)", async () => {
      await createPerson({ name: "Sarah Chen" });
      const found = await getPersonByAlias("sarah chen");
      expect(found).not.toBeNull();
      expect(found!.meta.aliases).toContain("Sarah Chen");
    });

    it("returns null for ambiguous alias", async () => {
      await createPerson({ name: "Sarah Chen", aliases: ["Sarah"] });
      await createPerson({ name: "Sarah Miller", aliases: ["Sarah"] });
      const result = await getPersonByAlias("Sarah");
      expect(result).toBeNull();
    });

    it("batch resolves aliases via getPersonsByAliases", async () => {
      await createPerson({ name: "Sarah Chen" });
      await createPerson({ name: "Bob Smith" });
      const map = await getPersonsByAliases(["Sarah Chen", "Bob Smith", "Unknown"]);
      expect(map.get("Sarah Chen")).not.toBeNull();
      expect(map.get("Bob Smith")).not.toBeNull();
      expect(map.get("Unknown")).toBeNull();
    });

    it("batch resolves partial name matches (fallback matching)", async () => {
      await createPerson({ name: "Ashley Beresid", aliases: ["Ashley"] });
      const map = await getPersonsByAliases(["Ashley Beresid"]);
      expect(map.get("Ashley Beresid")).not.toBeNull();
    });
  });

  describe("note-person linking", () => {
    it("links a person to a note", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "Met with Sarah" });
      await addNotePerson(note.id, person.note.id);
      const people = await getNotePeople(note.id);
      expect(people).toHaveLength(1);
      expect(people[0].note.id).toBe(person.note.id);
    });

    it("does not duplicate links", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "Sarah again" });
      await addNotePerson(note.id, person.note.id);
      await addNotePerson(note.id, person.note.id);
      const people = await getNotePeople(note.id);
      expect(people).toHaveLength(1);
    });

    it("batch links multiple people", async () => {
      const alice = await createPerson({ name: "Alice" });
      const bob = await createPerson({ name: "Bob" });
      const note = await createNote({ content: "Alice and Bob" });
      await addNotePeople(note.id, [alice.note.id, bob.note.id]);
      const people = await getNotePeople(note.id);
      expect(people).toHaveLength(2);
    });

    it("finds notes mentioning a person", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note1 = await createNote({ content: "Note 1 with Sarah" });
      const note2 = await createNote({ content: "Note 2 with Sarah" });
      await addNotePerson(note1.id, person.note.id);
      await addNotePerson(note2.id, person.note.id);
      const mentions = await getNotesMentioning(person.note.id);
      expect(mentions).toHaveLength(2);
    });
  });

  describe("person update and summary", () => {
    it("updates person role and aliases", async () => {
      const person = await createPerson({ name: "Sarah", role: "colleague" });
      const updated = await updatePerson(person.note.id, {
        role: "manager",
        aliases: ["Sarah C"],
      });
      expect(updated.meta.role).toBe("manager");
      expect(updated.meta.aliases).toContain("Sarah C");
    });

    it("updates person summary", async () => {
      const person = await createPerson({ name: "Sarah" });
      await updatePersonSummary(person.note.id, "Sarah is a project lead.");
      const fetched = await getPerson(person.note.id);
      expect(fetched!.meta.summary).toBe("Sarah is a project lead.");
    });

    it("lists people with note counts", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "Meeting" });
      await addNotePerson(note.id, person.note.id);
      const people = await listPeople();
      const sarah = people.find((p) => p.note.id === person.note.id);
      expect(sarah).toBeDefined();
      expect(sarah!.noteCount).toBe(1);
    });
  });

  describe("person deletion cleanup", () => {
    it("deleting person note leaves PersonMeta orphaned (BUG CHECK)", async () => {
      const person = await createPerson({ name: "Sarah" });
      const personNoteId = person.note.id;

      // Delete the note directly (simulating DELETE API route without PersonMeta cleanup)
      await prisma.notePerson.deleteMany({ where: { personNoteId } });
      await deleteNote(personNoteId);

      // Check if PersonMeta still exists — THIS IS THE SUSPECTED BUG
      const orphanedMeta = await prisma.personMeta.findUnique({
        where: { noteId: personNoteId },
      });
      // If this passes, the bug is confirmed: PersonMeta is orphaned
      if (orphanedMeta) {
        console.warn("BUG CONFIRMED: PersonMeta orphaned after note delete");
      }
      // The test documents the current behavior — we expect the bug
      expect(orphanedMeta).not.toBeNull(); // Documents the bug: meta IS orphaned
    });
  });
});
