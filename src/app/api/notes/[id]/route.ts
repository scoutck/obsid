import { NextRequest, NextResponse } from "next/server";
import { getNote, updateNote, deleteNote } from "@/lib/notes";
import { deleteCommandsForNote } from "@/lib/commands";
import { embedNote } from "@/lib/embeddings";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const note = await getNote(id);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  return NextResponse.json(note);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const note = await updateNote(id, body);

  // Fire-and-forget embedding
  embedNote(note.id, note.title, note.content).catch((err) =>
    console.error("[embed] Background embed failed:", err)
  );

  return NextResponse.json(note);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteCommandsForNote(id);
  await deleteNote(id);
  return NextResponse.json({ success: true });
}
