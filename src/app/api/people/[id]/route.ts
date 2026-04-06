import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getPerson, getNotesMentioning } from "@/lib/people";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;

  // Fetch person, connected notes, and highlights in parallel
  const [person, connectedNotes, notePersonEntries] = await Promise.all([
    getPerson(id, db),
    getNotesMentioning(id, db),
    db.notePerson.findMany({ where: { personNoteId: id } }),
  ]);

  if (!person) {
    return Response.json({ error: "Person not found" }, { status: 404 });
  }
  const highlightMap = new Map(
    notePersonEntries.map((np) => [np.noteId, np.highlight])
  );

  const notesWithHighlights = connectedNotes.map((note) => ({
    id: note.id,
    title: note.title,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    highlight: highlightMap.get(note.id) || note.content.slice(0, 150),
  }));

  // Sort by most recent first
  notesWithHighlights.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return Response.json({
    person: { note: person.note, meta: person.meta },
    connectedNotes: notesWithHighlights,
  });
}
