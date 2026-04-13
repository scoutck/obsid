import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createTask, getTasks, getTasksForNote, getTasksForPerson, searchTasks } from "@/lib/tasks";
import { getNotesByIds } from "@/lib/notes";
import type { Task, TaskWithNote } from "@/types";

function enrichTasks(tasks: Task[], noteTitleMap: Map<string, string>): TaskWithNote[] {
  return tasks.map((t) => ({
    ...t,
    noteTitle: t.noteId ? noteTitleMap.get(t.noteId) ?? null : null,
  }));
}

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const { searchParams } = new URL(request.url);
  const noteId = searchParams.get("noteId");
  const personNoteId = searchParams.get("personNoteId");
  const q = searchParams.get("q");

  let tasks: Task[];
  if (q) tasks = await searchTasks(q, db);
  else if (noteId) tasks = await getTasksForNote(noteId, db);
  else if (personNoteId) tasks = await getTasksForPerson(personNoteId, db);
  else tasks = await getTasks(db);

  const noteIds = [...new Set(tasks.map((t) => t.noteId).filter(Boolean))] as string[];
  const notes = await getNotesByIds(noteIds, db);
  const noteTitleMap = new Map(notes.map((n) => [n.id, n.title]));

  return NextResponse.json(enrichTasks(tasks, noteTitleMap));
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const body = await request.json();
  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const task = await createTask(body, db);
  return NextResponse.json(task, { status: 201 });
}
