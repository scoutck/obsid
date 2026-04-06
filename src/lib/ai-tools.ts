import { searchNotes, getNote, createNote, updateNote } from "@/lib/notes";
import { listPeople, getPersonByAlias, addNotePerson } from "@/lib/people";
import { semanticSearch } from "@/lib/embeddings";
import { createPendingPerson } from "@/lib/pending-people";
import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import type Anthropic from "@anthropic-ai/sdk";

export const vaultTools: Anthropic.Tool[] = [
  {
    name: "semantic_search",
    description: "Search notes by meaning using embeddings. Finds notes related to the query even if they don't contain the exact words.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Natural language search query" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_note",
    description: "Read the full content of a specific note by its ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "The UUID of the note to read" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_note",
    description: "Create a new note with title, content, tags, and type.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Note title" },
        content: { type: "string", description: "Markdown content" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for the note" },
        type: { type: "string", description: "Note type (e.g., decision, idea, meeting)" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_note",
    description: "Update an existing note. Can append to content or replace fields.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "The UUID of the note to update" },
        title: { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content (optional)" },
        append: { type: "string", description: "Text to append to existing content (optional)" },
        tags: { type: "array", items: { type: "string" }, description: "New tags (optional)" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_people",
    description:
      "List all known people in the vault with their aliases, roles, and the number of notes that mention them.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "update_person",
    description: "Update a person's note by appending an observation. Use when the user says something about a person.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Person's name or alias" },
        observation: { type: "string", description: "Text to append" },
      },
      required: ["name", "observation"],
    },
  },
  {
    name: "create_pending_person",
    description: "Flag a new person name for user confirmation. Use when you encounter a name that doesn't match any known person.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "The person's name" },
        context: { type: "string", description: "Context where the name was mentioned" },
      },
      required: ["name", "context"],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  meta?: { sourceNoteId?: string; sourceConversationId?: string },
  db: PrismaClient = defaultPrisma
): Promise<string> {
  switch (name) {
    case "semantic_search": {
      try {
        const results = await semanticSearch(input.query as string, (input.limit as number) ?? 10, db);
        if (results.length === 0) return "No notes found matching that query.";
        const notes = await Promise.all(
          results.map(async (r) => {
            const note = await getNote(r.noteId, db);
            return note
              ? `- **${note.title || "Untitled"}** (id: ${note.id}, relevance: ${(r.score * 100).toFixed(0)}%)\n  Preview: ${note.content.slice(0, 150)}...`
              : null;
          })
        );
        return notes.filter(Boolean).join("\n\n");
      } catch {
        // Fall back to keyword search
        const notes = await searchNotes(input.query as string, db);
        if (notes.length === 0) return "No notes found matching that query.";
        return notes.slice(0, 10).map((n) => `- **${n.title || "Untitled"}** (id: ${n.id})\n  Preview: ${n.content.slice(0, 150)}...`).join("\n\n");
      }
    }

    case "read_note": {
      const note = await getNote(input.id as string, db);
      if (!note) return "Note not found.";
      return `# ${note.title}\n\nTags: ${note.tags.join(", ") || "none"}\nType: ${note.type || "none"}\n\n${note.content}`;
    }

    case "create_note": {
      const note = await createNote({
        title: input.title as string,
        content: input.content as string,
        tags: (input.tags as string[]) || [],
        type: (input.type as string) || "",
      }, db);
      return `Created note "${note.title}" (id: ${note.id})`;
    }

    case "update_note": {
      const existing = await getNote(input.id as string, db);
      if (!existing) return "Note not found.";

      const updates: Record<string, unknown> = {};
      if (input.title) updates.title = input.title;
      if (input.content) updates.content = input.content;
      if (input.append) updates.content = existing.content + "\n" + input.append;
      if (input.tags) updates.tags = input.tags;

      const note = await updateNote(input.id as string, updates, db);
      return `Updated note "${note.title}" (id: ${note.id})`;
    }

    case "list_people": {
      const people = await listPeople(db);
      if (people.length === 0) return "No people tracked yet.";
      return people
        .map(
          (p) =>
            `- **${p.note.title}** (id: ${p.note.id})\n  Aliases: ${p.meta.aliases.join(", ")}\n  Role: ${p.meta.role || "unknown"}\n  Mentioned in: ${p.noteCount} notes`
        )
        .join("\n\n");
    }

    case "update_person": {
      const person = await getPersonByAlias(input.name as string, db);
      if (!person) return `Person "${input.name}" not found. Consider using create_pending_person to flag this name.`;
      const existing = await getNote(person.note.id, db);
      if (!existing) return "Person note not found.";
      const timestamp = new Date().toISOString().split("T")[0];
      const appendText = `\n\n_${timestamp}:_ ${input.observation as string}`;
      await updateNote(person.note.id, { content: existing.content + appendText }, db);
      if (meta?.sourceNoteId) {
        await addNotePerson(meta.sourceNoteId, person.note.id, db);
      }
      // Fire-and-forget person summary regeneration
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/ai/person-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personNoteId: person.note.id }),
      }).catch(() => {});
      return `Added observation to ${person.note.title}'s note`;
    }

    case "create_pending_person": {
      await createPendingPerson({
        name: input.name as string,
        context: input.context as string,
        sourceNoteId: meta?.sourceNoteId,
        sourceConversationId: meta?.sourceConversationId,
      }, db);
      return `Flagged "${input.name}" as pending — user will review`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
