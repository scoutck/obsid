import { searchNotes, getNote, createNote, updateNote } from "@/lib/notes";
import type Anthropic from "@anthropic-ai/sdk";

export const vaultTools: Anthropic.Tool[] = [
  {
    name: "search_notes",
    description: "Search through all notes by content, title, or tags. Returns matching notes with their titles and snippets.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query — matches against note titles, content, and tags",
        },
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
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "search_notes": {
      const notes = await searchNotes(input.query as string);
      if (notes.length === 0) return "No notes found matching that query.";
      return notes
        .map((n) => `- **${n.title || "Untitled"}** (id: ${n.id})\n  Tags: ${n.tags.join(", ") || "none"}\n  Preview: ${n.content.slice(0, 150)}...`)
        .join("\n\n");
    }

    case "read_note": {
      const note = await getNote(input.id as string);
      if (!note) return "Note not found.";
      return `# ${note.title}\n\nTags: ${note.tags.join(", ") || "none"}\nType: ${note.type || "none"}\n\n${note.content}`;
    }

    case "create_note": {
      const note = await createNote({
        title: input.title as string,
        content: input.content as string,
        tags: (input.tags as string[]) || [],
        type: (input.type as string) || "",
      });
      return `Created note "${note.title}" (id: ${note.id})`;
    }

    case "update_note": {
      const existing = await getNote(input.id as string);
      if (!existing) return "Note not found.";

      const updates: Record<string, unknown> = {};
      if (input.title) updates.title = input.title;
      if (input.content) updates.content = input.content;
      if (input.append) updates.content = existing.content + "\n" + input.append;
      if (input.tags) updates.tags = input.tags;

      const note = await updateNote(input.id as string, updates);
      return `Updated note "${note.title}" (id: ${note.id})`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
