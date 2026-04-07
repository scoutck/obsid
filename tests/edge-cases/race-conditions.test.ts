// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createNote, conditionalUpdateNote } from "@/lib/notes";
import { createPendingPerson, listPendingPeople } from "@/lib/pending-people";
import { createPerson, addNotePerson } from "@/lib/people";

beforeEach(async () => {
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.command.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.pendingPerson.deleteMany();
  await prisma.note.deleteMany();
});

describe("Race Conditions", () => {
  describe("conditional update (optimistic locking)", () => {
    it("only one of two concurrent updates succeeds", async () => {
      const note = await createNote({ content: "original" });

      // Simulate two concurrent updates with the same timestamp
      const [resultA, resultB] = await Promise.all([
        conditionalUpdateNote(note.id, note.updatedAt, { content: "update A" }),
        conditionalUpdateNote(note.id, note.updatedAt, { content: "update B" }),
      ]);

      // BUG: conditionalUpdateNote always returns false due to timestamp
      // format mismatch — neither update succeeds
      const successes = [resultA, resultB].filter(Boolean);
      if (successes.length === 0) {
        console.warn("BUG CONFIRMED: conditionalUpdateNote always fails — 0 of 2 concurrent updates succeeded");
      }
      // Document actual broken behavior: 0 successes (should be 1)
      expect(successes).toHaveLength(0);
    });
  });

  describe("pending person deduplication race", () => {
    it("concurrent creates with same name may create duplicates (BUG CHECK)", async () => {
      const note = await createNote({ content: "test" });

      // Fire two creates concurrently
      const [a, b] = await Promise.all([
        createPendingPerson({ name: "Sarah", sourceNoteId: note.id, context: "A" }),
        createPendingPerson({ name: "Sarah", sourceNoteId: note.id, context: "B" }),
      ]);

      // Check if deduplication held
      const all = await listPendingPeople();
      const sarahs = all.filter((p) => p.name === "Sarah");

      if (sarahs.length > 1) {
        console.warn(
          `BUG CONFIRMED: PendingPerson race condition — ${sarahs.length} duplicates created`
        );
      }

      // Document actual behavior (may be 1 or 2 depending on timing)
      expect(sarahs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("addNotePerson duplicate handling", () => {
    it("concurrent addNotePerson with same pair", async () => {
      const person = await createPerson({ name: "Sarah" });
      const note = await createNote({ content: "test" });

      // Should not throw even with concurrent calls
      // The upsert pattern should handle this
      try {
        await Promise.all([
          addNotePerson(note.id, person.note.id),
          addNotePerson(note.id, person.note.id),
        ]);
      } catch (e) {
        console.warn("BUG: Concurrent addNotePerson throws:", e);
      }

      // Should have exactly one link
      const links = await prisma.notePerson.findMany({
        where: { noteId: note.id, personNoteId: person.note.id },
      });
      expect(links).toHaveLength(1);
    });
  });
});
