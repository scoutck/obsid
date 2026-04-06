import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createNote, listNotes, searchNotes } from "@/lib/notes";

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const query = request.nextUrl.searchParams.get("q");

  if (query) {
    const notes = await searchNotes(query, db);
    return NextResponse.json(notes);
  }

  const notes = await listNotes(db);
  return NextResponse.json(notes);
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const body = await request.json();
  const note = await createNote(body, db);
  return NextResponse.json(note, { status: 201 });
}
