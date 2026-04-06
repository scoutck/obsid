import { describe, it, expect, beforeEach } from "vitest";
import {
  createPendingPerson,
  listPendingPeople,
  updatePendingPersonStatus,
  dismissPendingPerson,
} from "@/lib/pending-people";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.pendingPerson.deleteMany();
});

describe("pending people", () => {
  it("creates a pending person with source context", async () => {
    const pp = await createPendingPerson({
      name: "Sarah Chen",
      sourceNoteId: "note-123",
      context: "Sarah Chen mentioned the budget is tight",
    });
    expect(pp.name).toBe("Sarah Chen");
    expect(pp.status).toBe("pending");
    expect(pp.sourceNoteId).toBe("note-123");
  });

  it("lists only pending entries", async () => {
    await createPendingPerson({ name: "Alice", context: "Alice said hi" });
    const dismissed = await createPendingPerson({ name: "Bob", context: "Bob left" });
    await dismissPendingPerson(dismissed.id);

    const pending = await listPendingPeople();
    expect(pending).toHaveLength(1);
    expect(pending[0].name).toBe("Alice");
  });

  it("updates status to confirmed", async () => {
    const pp = await createPendingPerson({ name: "Carol", context: "Carol joined" });
    await updatePendingPersonStatus(pp.id, "confirmed");

    const pending = await listPendingPeople();
    expect(pending).toHaveLength(0);
  });

  it("skips duplicate names for the same source", async () => {
    await createPendingPerson({
      name: "Dave",
      sourceNoteId: "note-1",
      context: "Dave spoke",
    });
    await createPendingPerson({
      name: "Dave",
      sourceNoteId: "note-1",
      context: "Dave spoke again",
    });

    const pending = await listPendingPeople();
    expect(pending).toHaveLength(1);
  });
});
