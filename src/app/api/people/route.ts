import { NextRequest } from "next/server";
import { listPeople, updatePerson } from "@/lib/people";
import { prisma } from "@/lib/db";
import { parsePersonMeta } from "@/types";

export async function GET() {
  const people = await listPeople();
  return Response.json(people);
}

export async function PUT(request: NextRequest) {
  const { noteId, aliases, role } = await request.json();
  const updated = await updatePerson(noteId, { aliases, role });
  return Response.json(updated.meta);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.action !== "merge") {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }

  const { targetNoteId, sourceNoteId } = body;

  // Fetch both PersonMeta records
  const targetMeta = await prisma.personMeta.findUnique({
    where: { noteId: targetNoteId },
  });
  const sourceMeta = await prisma.personMeta.findUnique({
    where: { noteId: sourceNoteId },
  });

  if (!targetMeta || !sourceMeta) {
    return Response.json(
      { error: "Person not found" },
      { status: 404 }
    );
  }

  // Merge aliases (union, deduplicated)
  const targetAliases: string[] = JSON.parse(targetMeta.aliases);
  const sourceAliases: string[] = JSON.parse(sourceMeta.aliases);
  const mergedAliases = [...new Set([...targetAliases, ...sourceAliases])];

  // Update target PersonMeta with merged aliases
  const updatedRaw = await prisma.personMeta.update({
    where: { noteId: targetNoteId },
    data: { aliases: JSON.stringify(mergedAliases) },
  });

  // Re-link all NotePerson entries from source to target
  const sourceLinks = await prisma.notePerson.findMany({
    where: { personNoteId: sourceNoteId },
  });

  for (const link of sourceLinks) {
    // Upsert: create link to target if it doesn't exist
    const existing = await prisma.notePerson.findUnique({
      where: {
        noteId_personNoteId: {
          noteId: link.noteId,
          personNoteId: targetNoteId,
        },
      },
    });
    if (!existing) {
      await prisma.notePerson.create({
        data: {
          noteId: link.noteId,
          personNoteId: targetNoteId,
        },
      });
    }
  }

  // Delete source's NotePerson links, PersonMeta, and Note
  await prisma.notePerson.deleteMany({
    where: { personNoteId: sourceNoteId },
  });
  await prisma.personMeta.delete({
    where: { noteId: sourceNoteId },
  });
  await prisma.note.delete({
    where: { id: sourceNoteId },
  });

  return Response.json(parsePersonMeta(updatedRaw));
}
