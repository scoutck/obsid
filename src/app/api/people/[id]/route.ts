import { NextRequest } from "next/server";
import { getPerson, getNotesMentioning } from "@/lib/people";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const person = await getPerson(id);
  if (!person) {
    return Response.json({ error: "Person not found" }, { status: 404 });
  }

  const connectedNotes = await getNotesMentioning(id);

  // Get highlights from NotePerson join table
  const notePersonEntries = await prisma.notePerson.findMany({
    where: { personNoteId: id },
  });
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
