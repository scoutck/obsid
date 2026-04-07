import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createTask, getTasks, getTasksForNote, getTasksForPerson, searchTasks } from "@/lib/tasks";

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const { searchParams } = new URL(request.url);
  const noteId = searchParams.get("noteId");
  const personNoteId = searchParams.get("personNoteId");
  const q = searchParams.get("q");

  if (q) {
    const tasks = await searchTasks(q, db);
    return NextResponse.json(tasks);
  }
  if (noteId) {
    const tasks = await getTasksForNote(noteId, db);
    return NextResponse.json(tasks);
  }
  if (personNoteId) {
    const tasks = await getTasksForPerson(personNoteId, db);
    return NextResponse.json(tasks);
  }

  const tasks = await getTasks(db);
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const body = await request.json();
  const task = await createTask(body, db);
  return NextResponse.json(task, { status: 201 });
}
