import { prisma } from "@/lib/db";
import { parseNote, parsePersonMeta, type Note, type PersonMeta } from "@/types";

interface CreatePersonInput {
  name: string;
  aliases?: string[];
  role?: string;
  content?: string;
  userContext?: string;
}

interface UpdatePersonInput {
  aliases?: string[];
  role?: string;
}

interface PersonResult {
  note: Note;
  meta: PersonMeta;
}

interface PersonWithCount extends PersonResult {
  noteCount: number;
}

export async function createPerson(
  input: CreatePersonInput
): Promise<PersonResult> {
  const aliases = [input.name, ...(input.aliases ?? [])];
  // Deduplicate aliases (case-sensitive — the name itself should always appear exactly once)
  const uniqueAliases = [...new Set(aliases)];

  const raw = await prisma.note.create({
    data: {
      title: input.name,
      content: input.content ?? "",
      type: "person",
      tags: "[]",
      links: "[]",
    },
  });
  const note = parseNote(raw);

  const rawMeta = await prisma.personMeta.create({
    data: {
      noteId: note.id,
      aliases: JSON.stringify(uniqueAliases),
      role: input.role ?? "",
      userContext: input.userContext ?? "",
    },
  });
  const meta = parsePersonMeta(rawMeta);

  return { note, meta };
}

export async function getPerson(noteId: string): Promise<PersonResult | null> {
  const raw = await prisma.note.findUnique({ where: { id: noteId } });
  if (!raw) return null;

  const rawMeta = await prisma.personMeta.findUnique({
    where: { noteId },
  });
  if (!rawMeta) return null;

  return {
    note: parseNote(raw),
    meta: parsePersonMeta(rawMeta),
  };
}

export async function getPersonByAlias(
  alias: string
): Promise<PersonResult | null> {
  // Fetch all PersonMeta rows and filter by alias case-insensitively.
  // SQLite JSON functions are limited with libsql adapter, so we do this in JS.
  const allMetas = await prisma.personMeta.findMany();
  const lowerAlias = alias.toLowerCase();

  const matches = allMetas.filter((m) => {
    const aliases: string[] = JSON.parse(m.aliases);
    return aliases.some((a) => a.toLowerCase() === lowerAlias);
  });

  // Return null if 0 or 2+ matches (ambiguous)
  if (matches.length !== 1) return null;

  const rawMeta = matches[0];
  const raw = await prisma.note.findUnique({
    where: { id: rawMeta.noteId },
  });
  if (!raw) return null;

  return {
    note: parseNote(raw),
    meta: parsePersonMeta(rawMeta),
  };
}

export async function listPeople(): Promise<PersonWithCount[]> {
  const allMetas = await prisma.personMeta.findMany();

  const results: PersonWithCount[] = [];
  for (const rawMeta of allMetas) {
    const raw = await prisma.note.findUnique({
      where: { id: rawMeta.noteId },
    });
    if (!raw) continue;

    const count = await prisma.notePerson.count({
      where: { personNoteId: rawMeta.noteId },
    });

    results.push({
      note: parseNote(raw),
      meta: parsePersonMeta(rawMeta),
      noteCount: count,
    });
  }

  return results;
}

export async function updatePerson(
  noteId: string,
  input: UpdatePersonInput
): Promise<PersonResult> {
  const data: Record<string, unknown> = {};
  if (input.aliases !== undefined) data.aliases = JSON.stringify(input.aliases);
  if (input.role !== undefined) data.role = input.role;

  const rawMeta = await prisma.personMeta.update({
    where: { noteId },
    data,
  });

  const raw = await prisma.note.findUniqueOrThrow({
    where: { id: noteId },
  });

  return {
    note: parseNote(raw),
    meta: parsePersonMeta(rawMeta),
  };
}

export async function addNotePerson(
  noteId: string,
  personNoteId: string
): Promise<void> {
  // Upsert: create if not exists, ignore if already exists
  const existing = await prisma.notePerson.findUnique({
    where: {
      noteId_personNoteId: { noteId, personNoteId },
    },
  });
  if (existing) return;

  await prisma.notePerson.create({
    data: { noteId, personNoteId },
  });
}

export async function getNotePeople(noteId: string): Promise<PersonResult[]> {
  const links = await prisma.notePerson.findMany({
    where: { noteId },
  });

  const results: PersonResult[] = [];
  for (const link of links) {
    const person = await getPerson(link.personNoteId);
    if (person) results.push(person);
  }

  return results;
}

export async function getNotesMentioning(
  personNoteId: string
): Promise<Note[]> {
  const links = await prisma.notePerson.findMany({
    where: { personNoteId },
  });

  const notes: Note[] = [];
  for (const link of links) {
    const raw = await prisma.note.findUnique({
      where: { id: link.noteId },
    });
    if (raw) notes.push(parseNote(raw));
  }

  return notes;
}

export async function updatePersonSummary(
  noteId: string,
  summary: string
): Promise<void> {
  await prisma.personMeta.update({
    where: { noteId },
    data: { summary },
  });
}
