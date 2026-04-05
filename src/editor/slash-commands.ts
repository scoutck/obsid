export interface SlashCommand {
  label: string;
  category: "Formatting" | "Notes" | "Organization" | "AI";
  description: string;
  action: string;
}

export const slashCommands: SlashCommand[] = [
  // Formatting
  { label: "Bold", category: "Formatting", description: "Wrap with **", action: "format:bold" },
  { label: "Italic", category: "Formatting", description: "Wrap with *", action: "format:italic" },
  { label: "Strikethrough", category: "Formatting", description: "Wrap with ~~", action: "format:strikethrough" },
  { label: "Highlight", category: "Formatting", description: "Wrap with ==", action: "format:highlight" },
  { label: "Heading 1", category: "Formatting", description: "Insert #", action: "format:h1" },
  { label: "Heading 2", category: "Formatting", description: "Insert ##", action: "format:h2" },
  { label: "Bullet List", category: "Formatting", description: "Insert -", action: "format:bullet" },
  { label: "Numbered List", category: "Formatting", description: "Insert 1.", action: "format:number" },
  { label: "Divider", category: "Formatting", description: "Insert ---", action: "format:divider" },
  // Notes
  { label: "New Note", category: "Notes", description: "Create a new note", action: "note:new" },
  { label: "Open Note", category: "Notes", description: "Search and open a note", action: "note:open" },
  { label: "Daily Note", category: "Notes", description: "Open today's note", action: "note:daily" },
  // Organization
  { label: "Add Tag", category: "Organization", description: "Tag the current note", action: "org:tag" },
  { label: "Add Wiki-Link", category: "Organization", description: "Link to another note", action: "org:wiki-link" },
  { label: "Search Notes", category: "Organization", description: "Full-text search", action: "org:search" },
  { label: "Open Collection", category: "Organization", description: "Open a saved collection", action: "org:open-collection" },
  { label: "New Collection", category: "Organization", description: "Create a collection", action: "org:new-collection" },
  // AI
  { label: "Ask Claude", category: "AI", description: "Ask AI about your notes", action: "ai:ask" },
  { label: "Organize", category: "AI", description: "AI-tag and link this note", action: "ai:organize" },
];

export function filterCommands(query: string): SlashCommand[] {
  if (!query) return slashCommands;
  const lower = query.toLowerCase();
  return slashCommands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower) ||
      cmd.category.toLowerCase().includes(lower)
  );
}
