import { NextRequest, NextResponse } from "next/server";
import { createNote, listNotes, searchNotes } from "@/lib/notes";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (query) {
    const notes = await searchNotes(query);
    return NextResponse.json(notes);
  }

  const notes = await listNotes();
  return NextResponse.json(notes);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const note = await createNote(body);
  return NextResponse.json(note, { status: 201 });
}
