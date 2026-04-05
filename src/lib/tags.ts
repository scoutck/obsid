import { prisma } from "@/lib/db";

// Re-export the pure function so server-side code can import from either location
export { extractInlineTags } from "@/lib/extract-tags";

export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Query all notes and aggregate tag counts.
 * Returns sorted by count descending.
 */
export async function getTagVocabulary(): Promise<TagCount[]> {
  const notes = await prisma.note.findMany({
    select: { tags: true },
  });

  const counts = new Map<string, number>();

  for (const note of notes) {
    const tags: string[] = JSON.parse(note.tags);
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const result: TagCount[] = [];
  for (const [tag, count] of counts) {
    result.push({ tag, count });
  }

  result.sort((a, b) => b.count - a.count);

  return result;
}
