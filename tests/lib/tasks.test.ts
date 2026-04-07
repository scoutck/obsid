// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  createTask,
  getTask,
  getTasks,
  getTasksForNote,
  getTasksForPerson,
  updateTask,
  deleteTask,
  searchTasks,
} from "@/lib/tasks";
import { createNote } from "@/lib/notes";
import { createPerson } from "@/lib/people";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.task.deleteMany();
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.note.deleteMany();
});

describe("createTask", () => {
  it("creates a standalone task with defaults", async () => {
    const task = await createTask({ title: "Buy groceries" });
    expect(task.id).toBeDefined();
    expect(task.title).toBe("Buy groceries");
    expect(task.completed).toBe(false);
    expect(task.dueDate).toBeNull();
    expect(task.noteId).toBeNull();
    expect(task.personNoteId).toBeNull();
  });

  it("creates a task linked to a note", async () => {
    const note = await createNote({ title: "Meeting notes" });
    const task = await createTask({ title: "Follow up", noteId: note.id });
    expect(task.noteId).toBe(note.id);
    expect(task.personNoteId).toBeNull();
  });

  it("creates a task linked to a person note and auto-sets personNoteId", async () => {
    const person = await createPerson({ name: "Sarah", role: "colleague" });
    const task = await createTask({ title: "Call Sarah", noteId: person.note.id });
    expect(task.noteId).toBe(person.note.id);
    expect(task.personNoteId).toBe(person.note.id);
  });

  it("creates a task linked to a regular note that has a person link", async () => {
    const person = await createPerson({ name: "Sarah", role: "colleague" });
    const note = await createNote({ title: "Meeting with Sarah" });
    await prisma.notePerson.create({
      data: { noteId: note.id, personNoteId: person.note.id },
    });
    const task = await createTask({ title: "Send agenda", noteId: note.id });
    expect(task.noteId).toBe(note.id);
    expect(task.personNoteId).toBe(person.note.id);
  });

  it("creates a task with a due date", async () => {
    const due = new Date("2026-04-10T00:00:00.000Z");
    const task = await createTask({ title: "Deadline task", dueDate: due });
    expect(task.dueDate).toEqual(due);
  });
});

describe("getTasks", () => {
  it("returns tasks ordered: incomplete first by createdAt desc, then completed", async () => {
    const t1 = await createTask({ title: "First" });
    const t2 = await createTask({ title: "Second" });
    const t3 = await createTask({ title: "Third" });
    await updateTask(t1.id, { completed: true });

    const tasks = await getTasks();
    // t3, t2 (incomplete, newest first), then t1 (completed)
    expect(tasks[0].title).toBe("Third");
    expect(tasks[1].title).toBe("Second");
    expect(tasks[2].title).toBe("First");
    expect(tasks[2].completed).toBe(true);
  });
});

describe("getTasksForNote", () => {
  it("returns only tasks for the given note", async () => {
    const note = await createNote({ title: "My note" });
    await createTask({ title: "Linked task", noteId: note.id });
    await createTask({ title: "Standalone task" });

    const tasks = await getTasksForNote(note.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Linked task");
  });
});

describe("getTasksForPerson", () => {
  it("returns only tasks for the given person", async () => {
    const person = await createPerson({ name: "Sarah", role: "colleague" });
    await createTask({ title: "Call Sarah", noteId: person.note.id });
    await createTask({ title: "Unrelated task" });

    const tasks = await getTasksForPerson(person.note.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Call Sarah");
  });
});

describe("updateTask", () => {
  it("toggles completed", async () => {
    const task = await createTask({ title: "Do thing" });
    const updated = await updateTask(task.id, { completed: true });
    expect(updated.completed).toBe(true);
  });

  it("updates title", async () => {
    const task = await createTask({ title: "Old title" });
    const updated = await updateTask(task.id, { title: "New title" });
    expect(updated.title).toBe("New title");
  });

  it("updates dueDate", async () => {
    const task = await createTask({ title: "Task" });
    const due = new Date("2026-04-15T00:00:00.000Z");
    const updated = await updateTask(task.id, { dueDate: due });
    expect(updated.dueDate).toEqual(due);
  });
});

describe("deleteTask", () => {
  it("removes the task", async () => {
    const task = await createTask({ title: "Delete me" });
    await deleteTask(task.id);
    const found = await getTask(task.id);
    expect(found).toBeNull();
  });
});

describe("searchTasks", () => {
  it("finds tasks by title substring", async () => {
    await createTask({ title: "Buy groceries" });
    await createTask({ title: "Call dentist" });

    const results = await searchTasks("grocer");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Buy groceries");
  });
});
