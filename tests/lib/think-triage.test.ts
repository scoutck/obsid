// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  getTriageForNote,
  upsertTriage,
  deleteTriageForNote,
  getTriagesForNotes,
} from "@/lib/think-triage";
import { createNote } from "@/lib/notes";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.thinkBatchItem.deleteMany();
  await prisma.noteThinkTriage.deleteMany();
  await prisma.note.deleteMany();
});

describe("upsertTriage", () => {
  it("creates a triage result for a note", async () => {
    const note = await createNote({ title: "Test" });
    const triage = await upsertTriage(note.id, true, "Has reflective content");
    expect(triage.noteId).toBe(note.id);
    expect(triage.worthy).toBe(true);
    expect(triage.reason).toBe("Has reflective content");
    expect(triage.triagedAt).toBeInstanceOf(Date);
  });

  it("updates existing triage on re-triage", async () => {
    const note = await createNote({ title: "Test" });
    await upsertTriage(note.id, false, "Too short");
    const updated = await upsertTriage(note.id, true, "Content was added");
    expect(updated.worthy).toBe(true);
    expect(updated.reason).toBe("Content was added");
  });
});

describe("getTriageForNote", () => {
  it("returns null when no triage exists", async () => {
    const result = await getTriageForNote("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns the triage result", async () => {
    const note = await createNote({ title: "Test" });
    await upsertTriage(note.id, true, "Worthy");
    const result = await getTriageForNote(note.id);
    expect(result).not.toBeNull();
    expect(result!.worthy).toBe(true);
  });
});

describe("getTriagesForNotes", () => {
  it("returns triages for multiple notes", async () => {
    const note1 = await createNote({ title: "A" });
    const note2 = await createNote({ title: "B" });
    await upsertTriage(note1.id, true, "Worthy");
    await upsertTriage(note2.id, false, "Stub");
    const results = await getTriagesForNotes([note1.id, note2.id]);
    expect(results.size).toBe(2);
    expect(results.get(note1.id)!.worthy).toBe(true);
    expect(results.get(note2.id)!.worthy).toBe(false);
  });
});

describe("deleteTriageForNote", () => {
  it("removes the triage result", async () => {
    const note = await createNote({ title: "Test" });
    await upsertTriage(note.id, true, "Test");
    await deleteTriageForNote(note.id);
    const result = await getTriageForNote(note.id);
    expect(result).toBeNull();
  });
});
