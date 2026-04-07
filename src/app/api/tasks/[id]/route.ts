import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getTask, updateTask, deleteTask } from "@/lib/tasks";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  const existing = await getTask(id, db);
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const body = await request.json();
  const task = await updateTask(id, body, db);
  return NextResponse.json(task);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  const existing = await getTask(id, db);
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  await deleteTask(id, db);
  return NextResponse.json({ success: true });
}
