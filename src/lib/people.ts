import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
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
  input: CreatePersonInput,
  db: PrismaClient = defaultPrisma
): Promise<PersonResult> {
  const aliases = [input.name, ...(input.aliases ?? [])];
  // Deduplicate aliases (case-sensitive — the name itself should always appear exactly once)
  const uniqueAliases = [...new Set(aliases)];

  const raw = await db.note.create({
    data: {
      title: input.name,
      content: input.content ?? "",
      type: "person",
      tags: "[]",
      links: "[]",
    },
  });
  const note = parseNote(raw);

  const rawMeta = await db.personMeta.create({
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

export async function getPerson(noteId: string, db: PrismaClient = defaultPrisma): Promise<PersonResult | null> {
  const raw = await db.note.findUnique({ where: { id: noteId } });
  if (!raw) return null;

  const rawMeta = await db.personMeta.findUnique({
    where: { noteId },
  });
  if (!rawMeta) return null;

  return {
    note: parseNote(raw),
    meta: parsePersonMeta(rawMeta),
  };
}

export async function getPersonByAlias(
  alias: string,
  db: PrismaClient = defaultPrisma
): Promise<PersonResult | null> {
  // Fetch all PersonMeta rows and filter by alias case-insensitively.
  // SQLite JSON functions are limited with libsql adapter, so we do this in JS.
  const allMetas = await db.personMeta.findMany();
  const lowerAlias = alias.toLowerCase();

  const matches = allMetas.filter((m) => {
    const aliases: string[] = JSON.parse(m.aliases);
    return aliases.some((a) => a.toLowerCase() === lowerAlias);
  });

  // Return null if 0 or 2+ matches (ambiguous)
  if (matches.length !== 1) return null;

  const rawMeta = matches[0];
  const raw = await db.note.findUnique({
    where: { id: rawMeta.noteId },
  });
  if (!raw) return null;

  return {
    note: parseNote(raw),
    meta: parsePersonMeta(rawMeta),
  };
}

export async function getPersonsByAliases(
  aliases: string[],
  db: PrismaClient = defaultPrisma
): Promise<Map<string, PersonResult | null>> {
  const allMetas = await db.personMeta.findMany();
  const result = new Map<string, PersonResult | null>();

  const metaAliases = allMetas.map((m) => ({
    meta: m,
    aliases: (JSON.parse(m.aliases) as string[]).map((a) => a.toLowerCase()),
  }));

  const neededNoteIds = new Set<string>();
  for (const alias of aliases) {
    const lower = alias.toLowerCase();
    const matches = metaAliases.filter((m) => m.aliases.includes(lower));
    if (matches.length === 1) neededNoteIds.add(matches[0].meta.noteId);
  }

  const notes =
    neededNoteIds.size > 0
      ? await db.note.findMany({ where: { id: { in: [...neededNoteIds] } } })
      : [];
  const noteMap = new Map(notes.map((n) => [n.id, n]));

  for (const alias of aliases) {
    const lower = alias.toLowerCase();
    const matches = metaAliases.filter((m) => m.aliases.includes(lower));
    if (matches.length !== 1) {
      result.set(alias, null);
      continue;
    }
    const rawMeta = matches[0].meta;
    const raw = noteMap.get(rawMeta.noteId);
    if (!raw) {
      result.set(alias, null);
      continue;
    }
    result.set(alias, { note: parseNote(raw), meta: parsePersonMeta(rawMeta) });
  }
  return result;
}

export async function listPeople(db: PrismaClient = defaultPrisma): Promise<PersonWithCount[]> {
  const allMetas = await db.personMeta.findMany();
  if (allMetas.length === 0) return [];

  const noteIds = allMetas.map((m) => m.noteId);

  // Batch fetch all person notes and mention counts in parallel
  const [rawNotes, countRows] = await Promise.all([
    db.note.findMany({ where: { id: { in: noteIds } } }),
    db.$queryRawUnsafe<Array<{ personNoteId: string; cnt: number }>>(
      `SELECT personNoteId, COUNT(*) as cnt FROM "NotePerson" WHERE personNoteId IN (${noteIds.map(() => "?").join(",")}) GROUP BY personNoteId`,
      ...noteIds
    ),
  ]);

  const noteMap = new Map(rawNotes.map((n) => [n.id, n]));
  const countMap = new Map(countRows.map((c) => [c.personNoteId, Number(c.cnt)]));

  const results: PersonWithCount[] = [];
  for (const rawMeta of allMetas) {
    const raw = noteMap.get(rawMeta.noteId);
    if (!raw) continue;
    results.push({
      note: parseNote(raw),
      meta: parsePersonMeta(rawMeta),
      noteCount: countMap.get(rawMeta.noteId) ?? 0,
    });
  }
  return results;
}

export async function updatePerson(
  noteId: string,
  input: UpdatePersonInput,
  db: PrismaClient = defaultPrisma
): Promise<PersonResult> {
  const data: Record<string, unknown> = {};
  if (input.aliases !== undefined) data.aliases = JSON.stringify(input.aliases);
  if (input.role !== undefined) data.role = input.role;

  const rawMeta = await db.personMeta.update({
    where: { noteId },
    data,
  });

  const raw = await db.note.findUniqueOrThrow({
    where: { id: noteId },
  });

  return {
    note: parseNote(raw),
    meta: parsePersonMeta(rawMeta),
  };
}

export async function addNotePerson(
  noteId: string,
  personNoteId: string,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  // Upsert: create if not exists, ignore if already exists
  const existing = await db.notePerson.findUnique({
    where: {
      noteId_personNoteId: { noteId, personNoteId },
    },
  });
  if (existing) return;

  await db.notePerson.create({
    data: { noteId, personNoteId },
  });
}

export async function addNotePeople(
  noteId: string,
  personNoteIds: string[],
  db: PrismaClient = defaultPrisma
): Promise<void> {
  if (personNoteIds.length === 0) return;

  const existing = await db.notePerson.findMany({
    where: { noteId, personNoteId: { in: personNoteIds } },
  });
  const existingSet = new Set(existing.map((e) => e.personNoteId));
  const newIds = personNoteIds.filter((id) => !existingSet.has(id));
  if (newIds.length === 0) return;

  await db.notePerson.createMany({
    data: newIds.map((personNoteId) => ({ noteId, personNoteId })),
  });
}

export async function getNotePeople(noteId: string, db: PrismaClient = defaultPrisma): Promise<PersonResult[]> {
  const links = await db.notePerson.findMany({ where: { noteId } });
  if (links.length === 0) return [];

  const personNoteIds = links.map((l) => l.personNoteId);
  const [rawNotes, rawMetas] = await Promise.all([
    db.note.findMany({ where: { id: { in: personNoteIds } } }),
    db.personMeta.findMany({ where: { noteId: { in: personNoteIds } } }),
  ]);

  const noteMap = new Map(rawNotes.map((n) => [n.id, n]));
  const metaMap = new Map(rawMetas.map((m) => [m.noteId, m]));

  const results: PersonResult[] = [];
  for (const id of personNoteIds) {
    const raw = noteMap.get(id);
    const rawMeta = metaMap.get(id);
    if (raw && rawMeta) {
      results.push({ note: parseNote(raw), meta: parsePersonMeta(rawMeta) });
    }
  }
  return results;
}

export async function getNotesMentioning(
  personNoteId: string,
  db: PrismaClient = defaultPrisma
): Promise<Note[]> {
  const links = await db.notePerson.findMany({ where: { personNoteId } });
  if (links.length === 0) return [];

  const noteIds = links.map((l) => l.noteId);
  const rawNotes = await db.note.findMany({ where: { id: { in: noteIds } } });
  return rawNotes.map(parseNote);
}

export async function updatePersonSummary(
  noteId: string,
  summary: string,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await db.personMeta.update({
    where: { noteId },
    data: { summary },
  });
}
