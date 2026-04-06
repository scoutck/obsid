import { NextRequest } from "next/server";
import { semanticSearch } from "@/lib/embeddings";
import { searchNotes, getNote } from "@/lib/notes";

export async function POST(request: NextRequest) {
  const { query, limit } = await request.json();

  try {
    const results = await semanticSearch(query, limit ?? 20);

    const notes = await Promise.all(
      results.map(async (r) => {
        const note = await getNote(r.noteId);
        return note;
      })
    );

    return Response.json(notes.filter(Boolean));
  } catch {
    // Fall back to keyword search if embeddings unavailable
    const notes = await searchNotes(query);
    return Response.json(notes.slice(0, limit ?? 20));
  }
}
