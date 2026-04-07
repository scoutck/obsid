import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import { parseTask, type Task } from "@/types";

interface CreateTaskInput {
  title: string;
  dueDate?: Date;
  noteId?: string;
}

interface UpdateTaskInput {
  title?: string;
  completed?: boolean;
  dueDate?: Date | null;
}

export async function createTask(
  input: CreateTaskInput,
  db: PrismaClient = defaultPrisma
): Promise<Task> {
  let personNoteId: string | null = null;

  if (input.noteId) {
    // Check if the note is a person note
    const note = await db.note.findUnique({
      where: { id: input.noteId },
      select: { id: true, type: true },
    });

    if (note?.type === "person") {
      personNoteId = note.id;
    } else {
      // Check NotePerson links for this note
      const link = await db.notePerson.findFirst({
        where: { noteId: input.noteId },
      });
      if (link) {
        personNoteId = link.personNoteId;
      }
    }
  }

  const raw = await db.task.create({
    data: {
      title: input.title,
      dueDate: input.dueDate ?? null,
      noteId: input.noteId ?? null,
      personNoteId,
    },
  });
  return parseTask(raw);
}

export async function getTask(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<Task | null> {
  const raw = await db.task.findUnique({ where: { id } });
  if (!raw) return null;
  return parseTask(raw);
}

export async function getTasks(
  db: PrismaClient = defaultPrisma
): Promise<Task[]> {
  const raw = await db.task.findMany({
    orderBy: [
      { completed: "asc" },
      { createdAt: "desc" },
    ],
  });
  return raw.map(parseTask);
}

export async function getTasksForNote(
  noteId: string,
  db: PrismaClient = defaultPrisma
): Promise<Task[]> {
  const raw = await db.task.findMany({
    where: { noteId },
    orderBy: { createdAt: "desc" },
  });
  return raw.map(parseTask);
}

export async function getTasksForPerson(
  personNoteId: string,
  db: PrismaClient = defaultPrisma
): Promise<Task[]> {
  const raw = await db.task.findMany({
    where: { personNoteId },
    orderBy: { createdAt: "desc" },
  });
  return raw.map(parseTask);
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
  db: PrismaClient = defaultPrisma
): Promise<Task> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.completed !== undefined) data.completed = input.completed;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate;

  const raw = await db.task.update({ where: { id }, data });
  return parseTask(raw);
}

export async function deleteTask(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await db.task.delete({ where: { id } });
}

export async function searchTasks(
  query: string,
  db: PrismaClient = defaultPrisma
): Promise<Task[]> {
  const term = `%${query}%`;
  const raw = await db.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      completed: boolean;
      dueDate: Date | null;
      noteId: string | null;
      personNoteId: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  >(
    `SELECT * FROM "Task" WHERE title LIKE ? ORDER BY completed ASC, createdAt DESC`,
    term
  );
  return raw.map((r) =>
    parseTask({
      ...r,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    })
  );
}
