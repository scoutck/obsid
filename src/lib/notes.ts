import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import { parseNote, type Note } from "@/types";
import { getPersonByAlias } from "@/lib/people";
import { extractWikiLinks } from "@/editor/wiki-links";

export interface NoteGraphEntry {
  note: Note;
  depth: number;
}

interface CreateNoteInput {
  title?: string;
  content?: string;
  tags?: string[];
  type?: string;
  links?: string[];
}

interface UpdateNoteInput {
  title?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  type?: string;
  links?: string[];
}

export async function createNote(input: CreateNoteInput, db: PrismaClient = defaultPrisma): Promise<Note> {
  const raw = await db.note.create({
    data: {
      title: input.title ?? "",
      content: input.content ?? "",
      tags: JSON.stringify(input.tags ?? []),
      type: input.type ?? "",
      links: JSON.stringify(input.links ?? []),
    },
  });
  return parseNote(raw);
}

export async function getNote(id: string, db: PrismaClient = defaultPrisma): Promise<Note | null> {
  const raw = await db.note.findUnique({ where: { id } });
  if (!raw) return null;
  return parseNote(raw);
}

export async function getNotesByIds(ids: string[], db: PrismaClient = defaultPrisma): Promise<Note[]> {
  if (ids.length === 0) return [];
  const raw = await db.note.findMany({ where: { id: { in: ids } } });
  return raw.map(parseNote);
}

export async function updateNote(
  id: string,
  input: UpdateNoteInput,
  db: PrismaClient = defaultPrisma
): Promise<Note> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) data.content = input.content;
  if (input.tags !== undefined) data.tags = JSON.stringify(input.tags);
  if (input.type !== undefined) data.type = input.type;
  if (input.links !== undefined) data.links = JSON.stringify(input.links);

  const raw = await db.note.update({ where: { id }, data });
  return parseNote(raw);
}

/**
 * Atomically update a note only if updatedAt matches the expected value.
 * Returns true if the update succeeded, false if the note was modified
 * since the snapshot (stale).
 */
export async function conditionalUpdateNote(
  id: string,
  expectedUpdatedAt: Date,
  input: UpdateNoteInput,
  db: PrismaClient = defaultPrisma
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.content !== undefined) {
    sets.push(`content = ?`);
    params.push(input.content);
  }
  if (input.summary !== undefined) {
    sets.push(`summary = ?`);
    params.push(input.summary);
  }
  if (input.tags !== undefined) {
    sets.push(`tags = ?`);
    params.push(JSON.stringify(input.tags));
  }

  if (sets.length === 0) return true;

  // Use ISO string (not CURRENT_TIMESTAMP) to match Prisma's format
  sets.push(`"updatedAt" = ?`);
  params.push(new Date().toISOString());
  params.push(id, expectedUpdatedAt);

  const result = await db.$executeRawUnsafe(
    `UPDATE "Note" SET ${sets.join(", ")} WHERE id = ? AND "updatedAt" = ?`,
    ...params
  );

  return result > 0;
}

export async function deleteNote(id: string, db: PrismaClient = defaultPrisma): Promise<void> {
  await db.note.delete({ where: { id } });
}

export async function listNotes(db: PrismaClient = defaultPrisma): Promise<Note[]> {
  const raw = await db.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      content: string;
      tags: string;
      type: string;
      links: string;
      unresolvedPeople: string;
      createdAt: string;
      updatedAt: string;
    }>
  >(`SELECT * FROM "Note" ORDER BY updatedAt DESC, rowid DESC`);
  return raw.map((r) =>
    parseNote({
      ...r,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    })
  );
}

/**
 * Fetch the most recent notes for organize context, filtered at the SQL level.
 * Excludes the given note and any person notes (by noteId set).
 */
export async function listContextNotes(
  excludeNoteId: string,
  personNoteIds: string[],
  limit: number = 100,
  db: PrismaClient = defaultPrisma
): Promise<Note[]> {
  const excludeIds = [excludeNoteId, ...personNoteIds];
  const placeholders = excludeIds.map(() => "?").join(", ");
  const raw = await db.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      content: string;
      tags: string;
      type: string;
      links: string;
      unresolvedPeople: string;
      createdAt: string;
      updatedAt: string;
    }>
  >(
    `SELECT * FROM "Note" WHERE id NOT IN (${placeholders}) ORDER BY updatedAt DESC, rowid DESC LIMIT ?`,
    ...excludeIds,
    limit
  );
  return raw.map((r) =>
    parseNote({
      ...r,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    })
  );
}

export async function searchNotes(query: string, db: PrismaClient = defaultPrisma): Promise<Note[]> {
  try {
    const results = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank`,
      query + "*"
    );

    if (results.length === 0) return [];

    const ids = results.map((r) => r.id);
    const raw = await db.note.findMany({
      where: { id: { in: ids } },
    });
    return raw.map(parseNote);
  } catch {
    // FTS table may not exist in test environment; fall back to LIKE search
    const term = `%${query}%`;
    const raw = await db.$queryRawUnsafe<
      Array<{
        id: string;
        title: string;
        content: string;
        tags: string;
        type: string;
        links: string;
        unresolvedPeople: string;
        createdAt: string;
        updatedAt: string;
      }>
    >(
      `SELECT * FROM "Note" WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?`,
      term,
      term,
      term
    );
    return raw.map((r) =>
      parseNote({
        ...r,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      })
    );
  }
}

export async function getRecentNotes(
  ids: string[],
  db: PrismaClient = defaultPrisma
): Promise<Note[]> {
  if (ids.length === 0) return [];
  const raw = await db.note.findMany({
    where: { id: { in: ids } },
  });
  return raw.map(parseNote);
}

/**
 * Find notes that have any of the given tags.
 * Tags are stored as JSON arrays in SQLite, so we use LIKE queries.
 */
export async function searchByTags(
  tags: string[],
  db: PrismaClient = defaultPrisma
): Promise<Note[]> {
  if (tags.length === 0) return [];

  const conditions = tags.map(() => `tags LIKE ?`).join(" OR ");
  const params = tags.map((t) => `%"${t}"%`);

  const raw = await db.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      content: string;
      summary: string;
      tags: string;
      type: string;
      links: string;
      unresolvedPeople: string;
      createdAt: string;
      updatedAt: string;
    }>
  >(
    `SELECT * FROM "Note" WHERE ${conditions} ORDER BY "updatedAt" DESC, rowid DESC`,
    ...params
  );
  return raw.map((r) =>
    parseNote({
      ...r,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    })
  );
}

/**
 * Find all notes linked to a person via the NotePerson table.
 * Resolves the person by alias first; returns [] if not found.
 */
export async function getNotesByPerson(
  nameOrAlias: string,
  db: PrismaClient = defaultPrisma
): Promise<Note[]> {
  const person = await getPersonByAlias(nameOrAlias, db);
  if (!person) return [];

  const links = await db.notePerson.findMany({
    where: { personNoteId: person.note.id },
  });
  if (links.length === 0) return [];

  const noteIds = links.map((l) => l.noteId);
  const raw = await db.note.findMany({
    where: { id: { in: noteIds } },
    orderBy: { updatedAt: "desc" },
  });
  return raw.map(parseNote);
}

/**
 * Build a graph of linked notes starting from a root note.
 * Follows [[wiki-links]] up to `depth` hops (default 2).
 * Tracks visited IDs to avoid cycles.
 */
export async function getNoteGraph(
  noteId: string,
  depth: number = 2,
  db: PrismaClient = defaultPrisma
): Promise<NoteGraphEntry[]> {
  const rootNote = await getNote(noteId, db);
  if (!rootNote) return [];

  const visited = new Set<string>([noteId]);
  const result: NoteGraphEntry[] = [{ note: rootNote, depth: 0 }];

  let currentLayer: Note[] = [rootNote];

  for (let d = 1; d <= depth; d++) {
    // Collect all wiki-link titles from the current layer
    const allLinkTitles = new Set<string>();
    for (const note of currentLayer) {
      const links = extractWikiLinks(note.content);
      for (const title of links) {
        allLinkTitles.add(title);
      }
    }

    if (allLinkTitles.size === 0) break;

    // Resolve titles to notes — use case-insensitive title matching
    const titleArray = [...allLinkTitles];
    const conditions = titleArray.map(() => `LOWER(title) = ?`).join(" OR ");
    const params = titleArray.map((t) => t.toLowerCase());

    const raw = await db.$queryRawUnsafe<
      Array<{
        id: string;
        title: string;
        content: string;
        summary: string;
        tags: string;
        type: string;
        links: string;
        unresolvedPeople: string;
        createdAt: string;
        updatedAt: string;
      }>
    >(
      `SELECT * FROM "Note" WHERE ${conditions}`,
      ...params
    );

    const resolved = raw.map((r) =>
      parseNote({
        ...r,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      })
    );

    const nextLayer: Note[] = [];
    for (const note of resolved) {
      if (!visited.has(note.id)) {
        visited.add(note.id);
        result.push({ note, depth: d });
        nextLayer.push(note);
      }
    }

    if (nextLayer.length === 0) break;
    currentLayer = nextLayer;
  }

  return result;
}

/**
 * Find notes with updatedAt between startDate and endDate.
 */
export async function searchByTimeframe(
  startDate: Date,
  endDate: Date,
  db: PrismaClient = defaultPrisma
): Promise<Note[]> {
  const raw = await db.note.findMany({
    where: {
      updatedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return raw.map(parseNote);
}
