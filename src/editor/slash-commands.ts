export interface SlashCommand {
  label: string;
  category: "Formatting" | "Notes" | "Organization" | "AI" | "Mode";
  description: string;
  action: string;
  mode?: "notes" | "chat";
}

export const slashCommands: SlashCommand[] = [
  // Formatting (notes-only)
  { label: "Bold", category: "Formatting", description: "Wrap with **", action: "format:bold", mode: "notes" },
  { label: "Italic", category: "Formatting", description: "Wrap with *", action: "format:italic", mode: "notes" },
  { label: "Strikethrough", category: "Formatting", description: "Wrap with ~~", action: "format:strikethrough", mode: "notes" },
  { label: "Highlight", category: "Formatting", description: "Wrap with ==", action: "format:highlight", mode: "notes" },
  { label: "Heading 1", category: "Formatting", description: "Insert #", action: "format:h1", mode: "notes" },
  { label: "Heading 2", category: "Formatting", description: "Insert ##", action: "format:h2", mode: "notes" },
  { label: "Bullet List", category: "Formatting", description: "Insert -", action: "format:bullet", mode: "notes" },
  { label: "Numbered List", category: "Formatting", description: "Insert 1.", action: "format:number", mode: "notes" },
  { label: "Divider", category: "Formatting", description: "Insert ---", action: "format:divider", mode: "notes" },
  // Notes (both modes)
  { label: "New Note", category: "Notes", description: "Create a new note", action: "note:new" },
  { label: "Open Note", category: "Notes", description: "Search and open a note", action: "note:open" },
  { label: "Daily Note", category: "Notes", description: "Open today's note", action: "note:daily" },
  // Organization
  { label: "Add Tag", category: "Organization", description: "Tag the current note", action: "org:tag", mode: "notes" },
  { label: "Add Wiki-Link", category: "Organization", description: "Link to another note", action: "org:wiki-link", mode: "notes" },
  { label: "Search Notes", category: "Organization", description: "Full-text search", action: "org:search", mode: "notes" },
  { label: "Open Collection", category: "Organization", description: "Open a saved collection", action: "org:open-collection", mode: "notes" },
  { label: "New Collection", category: "Organization", description: "Create a collection", action: "org:new-collection", mode: "notes" },
  { label: "People", category: "Organization", description: "View and manage people", action: "org:people" },
  { label: "New Person", category: "Organization", description: "Add a new person", action: "org:new-person" },
  { label: "Pending People", category: "Organization", description: "Review AI-detected people", action: "org:pending-people" },
  // AI (notes-only)
  { label: "Ask Claude", category: "AI", description: "Ask AI about your notes", action: "ai:ask", mode: "notes" },
  { label: "Organize", category: "AI", description: "AI-tag and link this note", action: "ai:organize", mode: "notes" },
  { label: "Claude Command", category: "AI", description: "Inline AI instruction", action: "ai:claude", mode: "notes" },
  // Mode
  { label: "Chat Mode", category: "Mode", description: "Switch to chat", action: "mode:chat", mode: "notes" },
  { label: "Notes Mode", category: "Mode", description: "Switch to notes", action: "mode:notes", mode: "chat" },
  { label: "New Chat", category: "Mode", description: "Start a new conversation", action: "mode:new-chat", mode: "chat" },
];

export function filterCommands(query: string, mode?: "notes" | "chat"): SlashCommand[] {
  let commands = slashCommands;
  if (mode) {
    commands = commands.filter((cmd) => !cmd.mode || cmd.mode === mode);
  }
  if (!query) return commands;
  const lower = query.toLowerCase();
  return commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower) ||
      cmd.category.toLowerCase().includes(lower)
  );
}
