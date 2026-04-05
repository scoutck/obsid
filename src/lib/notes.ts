import { prisma } from "@/lib/db";
import { parseNote, type Note } from "@/types";

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
  tags?: string[];
  type?: string;
  links?: string[];
  unresolvedPeople?: string[];
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const raw = await prisma.note.create({
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

export async function getNote(id: string): Promise<Note | null> {
  const raw = await prisma.note.findUnique({ where: { id } });
  if (!raw) return null;
  return parseNote(raw);
}

export async function updateNote(
  id: string,
  input: UpdateNoteInput
): Promise<Note> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) data.content = input.content;
  if (input.tags !== undefined) data.tags = JSON.stringify(input.tags);
  if (input.type !== undefined) data.type = input.type;
  if (input.links !== undefined) data.links = JSON.stringify(input.links);
  if (input.unresolvedPeople !== undefined) data.unresolvedPeople = JSON.stringify(input.unresolvedPeople);

  const raw = await prisma.note.update({ where: { id }, data });
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
  input: UpdateNoteInput
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.content !== undefined) {
    sets.push(`content = ?`);
    params.push(input.content);
  }
  if (input.tags !== undefined) {
    sets.push(`tags = ?`);
    params.push(JSON.stringify(input.tags));
  }
  if (input.unresolvedPeople !== undefined) {
    sets.push(`"unresolvedPeople" = ?`);
    params.push(JSON.stringify(input.unresolvedPeople));
  }

  if (sets.length === 0) return true;

  // Use ISO string (not CURRENT_TIMESTAMP) to match Prisma's format
  sets.push(`"updatedAt" = ?`);
  params.push(new Date().toISOString());
  params.push(id, expectedUpdatedAt.toISOString());

  const result = await prisma.$executeRawUnsafe(
    `UPDATE "Note" SET ${sets.join(", ")} WHERE id = ? AND "updatedAt" = ?`,
    ...params
  );

  return result > 0;
}

export async function deleteNote(id: string): Promise<void> {
  await prisma.note.delete({ where: { id } });
}

export async function listNotes(): Promise<Note[]> {
  const raw = await prisma.$queryRawUnsafe<
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
  limit: number = 100
): Promise<Note[]> {
  const excludeIds = [excludeNoteId, ...personNoteIds];
  const placeholders = excludeIds.map(() => "?").join(", ");
  const raw = await prisma.$queryRawUnsafe<
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

export async function searchNotes(query: string): Promise<Note[]> {
  try {
    const results = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank`,
      query + "*"
    );

    if (results.length === 0) return [];

    const ids = results.map((r) => r.id);
    const raw = await prisma.note.findMany({
      where: { id: { in: ids } },
    });
    return raw.map(parseNote);
  } catch {
    // FTS table may not exist in test environment; fall back to LIKE search
    const term = `%${query}%`;
    const raw = await prisma.$queryRawUnsafe<
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
  ids: string[]
): Promise<Note[]> {
  if (ids.length === 0) return [];
  const raw = await prisma.note.findMany({
    where: { id: { in: ids } },
  });
  return raw.map(parseNote);
}
