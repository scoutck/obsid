import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

interface ContentTask {
  title: string;
  completed: boolean;
}

/** Extract task items from markdown content (GFM checkbox syntax). */
export function extractTasksFromContent(content: string): ContentTask[] {
  const tasks: ContentTask[] = [];
  const regex = /^[\t ]*[-*+]\s+\[([ xX])\]\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const title = match[2].trim();
    if (title) {
      tasks.push({
        completed: match[1] !== " ",
        title,
      });
    }
  }
  return tasks;
}

/**
 * Sync inline checkbox tasks from note content to the Task table.
 * Creates new Task records for unrecognized titles, updates completed
 * state for known ones. Does NOT delete tasks removed from content
 * (safe default — avoids destroying manually-created tasks).
 */
export async function syncNoteTasks(
  noteId: string,
  contentTasks: ContentTask[],
  db: PrismaClient = defaultPrisma
): Promise<{ created: number; updated: number }> {
  if (contentTasks.length === 0) return { created: 0, updated: 0 };

  const [existingTasks, note] = await Promise.all([
    db.task.findMany({ where: { noteId } }),
    db.note.findUnique({
      where: { id: noteId },
      select: { id: true, type: true },
    }),
  ]);

  if (!note) return { created: 0, updated: 0 };

  // Resolve personNoteId once for all new tasks
  let personNoteId: string | null = null;
  if (note.type === "person") {
    personNoteId = note.id;
  } else {
    const link = await db.notePerson.findFirst({ where: { noteId } });
    if (link) personNoteId = link.personNoteId;
  }

  const existingByTitle = new Map(existingTasks.map((t) => [t.title, t]));
  let created = 0;
  let updated = 0;

  for (const ct of contentTasks) {
    const existing = existingByTitle.get(ct.title);
    if (existing) {
      if (existing.completed !== ct.completed) {
        await db.task.update({
          where: { id: existing.id },
          data: { completed: ct.completed },
        });
        updated++;
      }
      // Remove from map so duplicates create new records
      existingByTitle.delete(ct.title);
    } else {
      await db.task.create({
        data: {
          title: ct.title,
          noteId,
          personNoteId,
          completed: ct.completed,
        },
      });
      created++;
    }
  }

  return { created, updated };
}
