import { NextRequest } from "next/server";
import { semanticSearch } from "@/lib/embeddings";
import { getNote } from "@/lib/notes";

export async function POST(request: NextRequest) {
  const { query, limit } = await request.json();

  const results = await semanticSearch(query, limit ?? 20);

  const notes = await Promise.all(
    results.map(async (r) => {
      const note = await getNote(r.noteId);
      return note;
    })
  );

  return Response.json(notes.filter(Boolean));
}
