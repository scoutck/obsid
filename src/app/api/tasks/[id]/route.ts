import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { updateTask, deleteTask } from "@/lib/tasks";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
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
  await deleteTask(id, db);
  return NextResponse.json({ success: true });
}
