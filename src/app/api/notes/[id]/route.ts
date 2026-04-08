import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getNote, updateNote, deleteNote } from "@/lib/notes";
import { deleteCommandsForNote } from "@/lib/commands";
import { embedNote } from "@/lib/embeddings";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  const note = await getNote(id, db);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  return NextResponse.json(note);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  const body = await request.json();
  const note = await updateNote(id, body, db);

  // Fire-and-forget embedding
  embedNote(note.id, note.title, note.content, db).catch((err) =>
    console.error("[embed] Background embed failed:", err)
  );

  return NextResponse.json(note);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  await deleteCommandsForNote(id, db);
  await db.embedding.deleteMany({ where: { noteId: id } });
  await db.notePerson.deleteMany({ where: { noteId: id } });
  await db.notePerson.deleteMany({ where: { personNoteId: id } });
  await db.personMeta.deleteMany({ where: { noteId: id } });
  await db.pendingPerson.updateMany({
    where: { sourceNoteId: id },
    data: { sourceNoteId: null },
  });
  await db.task.updateMany({
    where: { noteId: id },
    data: { noteId: null },
  });
  await db.task.updateMany({
    where: { personNoteId: id },
    data: { personNoteId: null },
  });
  await db.userInsight.deleteMany({ where: { sourceNoteId: id } });
  await deleteNote(id, db);
  return NextResponse.json({ success: true });
}
