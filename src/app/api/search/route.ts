import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { semanticSearch } from "@/lib/embeddings";
import { searchNotes, getNotesByIds } from "@/lib/notes";

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const { query, limit } = await request.json();

  try {
    const results = await semanticSearch(query, limit ?? 20, db);
    const noteIds = results.map((r) => r.noteId);
    const notes = await getNotesByIds(noteIds, db);
    return Response.json(notes);
  } catch {
    // Fall back to keyword search if embeddings unavailable
    const notes = await searchNotes(query, db);
    return Response.json(notes.slice(0, limit ?? 20));
  }
}
