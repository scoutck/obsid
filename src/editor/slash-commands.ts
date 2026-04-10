export interface SlashCommand {
  label: string;
  category: "Formatting" | "Notes" | "Organization" | "AI" | "Mode";
  description: string;
  action: string;
  icon: string;
  mode?: "notes" | "chat";
  aliases?: string[];
}

export const slashCommands: SlashCommand[] = [
  // Formatting (notes-only)
  { label: "Bold", category: "Formatting", description: "Wrap with **", action: "format:bold", icon: "Bold", mode: "notes" },
  { label: "Italic", category: "Formatting", description: "Wrap with *", action: "format:italic", icon: "Italic", mode: "notes" },
  { label: "Strikethrough", category: "Formatting", description: "Wrap with ~~", action: "format:strikethrough", icon: "Strikethrough", mode: "notes" },
  { label: "Highlight", category: "Formatting", description: "Wrap with ==", action: "format:highlight", icon: "Highlighter", mode: "notes" },
  { label: "Heading 1", category: "Formatting", description: "Insert #", action: "format:h1", icon: "Heading1", mode: "notes", aliases: ["h1"] },
  { label: "Heading 2", category: "Formatting", description: "Insert ##", action: "format:h2", icon: "Heading2", mode: "notes", aliases: ["h2"] },
  { label: "Heading 3", category: "Formatting", description: "Insert ###", action: "format:h3", icon: "Heading3", mode: "notes", aliases: ["h3"] },
  { label: "Heading 4", category: "Formatting", description: "Insert ####", action: "format:h4", icon: "Heading4", mode: "notes", aliases: ["h4"] },
  { label: "Heading 5", category: "Formatting", description: "Insert #####", action: "format:h5", icon: "Heading5", mode: "notes", aliases: ["h5"] },
  { label: "Heading 6", category: "Formatting", description: "Insert ######", action: "format:h6", icon: "Heading6", mode: "notes", aliases: ["h6"] },
  { label: "Bullet List", category: "Formatting", description: "Insert -", action: "format:bullet", icon: "List", mode: "notes" },
  { label: "Numbered List", category: "Formatting", description: "Insert 1.", action: "format:number", icon: "ListOrdered", mode: "notes" },
  { label: "Checkbox", category: "Formatting", description: "Insert - [ ]", action: "format:checkbox", icon: "SquareCheck", mode: "notes" },
  { label: "Divider", category: "Formatting", description: "Insert ---", action: "format:divider", icon: "Minus", mode: "notes" },
  // Notes (both modes)
  { label: "New Note", category: "Notes", description: "Create a new note", action: "note:new", icon: "Plus" },
  { label: "Open Note", category: "Notes", description: "Search and open a note", action: "note:open", icon: "Search" },
  { label: "Daily Note", category: "Notes", description: "Open today's note", action: "note:daily", icon: "Calendar" },
  // Organization
  { label: "Add Tag", category: "Organization", description: "Tag the current note", action: "org:tag", icon: "Tag", mode: "notes" },
  { label: "Add Wiki-Link", category: "Organization", description: "Link to another note", action: "org:wiki-link", icon: "Link", mode: "notes" },
  { label: "Search Notes", category: "Organization", description: "Full-text search", action: "org:search", icon: "FileSearch", mode: "notes" },
  { label: "Open Collection", category: "Organization", description: "Open a saved collection", action: "org:open-collection", icon: "FolderOpen", mode: "notes" },
  { label: "New Collection", category: "Organization", description: "Create a collection", action: "org:new-collection", icon: "FolderPlus", mode: "notes" },
  { label: "People", category: "Organization", description: "View and manage people", action: "org:people", icon: "Users" },
  { label: "New Person", category: "Organization", description: "Add a new person", action: "org:new-person", icon: "UserPlus" },
  { label: "Pending People", category: "Organization", description: "Review AI-detected people", action: "org:pending-people", icon: "UserCheck" },
  // Tasks
  { label: "New Task", category: "Organization", description: "Create a task", action: "task:create", icon: "CirclePlus" },
  { label: "Tasks", category: "Organization", description: "View all tasks", action: "task:list", icon: "CheckCircle" },
  // Profile
  { label: "Me", category: "Organization", description: "View your profile", action: "profile:me", icon: "User" },
  // AI (notes-only)
  { label: "Ask Claude", category: "AI", description: "Ask AI about your notes", action: "ai:ask", icon: "Sparkles", mode: "notes" },
  { label: "Organize", category: "AI", description: "AI-tag and link this note", action: "ai:organize", icon: "Wand2", mode: "notes" },
  { label: "Claude Command", category: "AI", description: "Inline AI instruction", action: "ai:claude", icon: "Terminal", mode: "notes" },
  // Mode
  { label: "Chat Mode", category: "Mode", description: "Switch to chat", action: "mode:chat", icon: "MessageCircle", mode: "notes" },
  { label: "Notes Mode", category: "Mode", description: "Switch to notes", action: "mode:notes", icon: "FileText", mode: "chat" },
  { label: "New Chat", category: "Mode", description: "Start a new conversation", action: "mode:new-chat", icon: "MessageSquarePlus", mode: "chat" },
  { label: "Logout", category: "Mode", description: "Sign out of Obsid", action: "app:logout", icon: "LogOut" },
];

export function filterCommands(query: string, mode?: "notes" | "chat"): SlashCommand[] {
  let commands = slashCommands;
  if (mode) {
    commands = commands.filter((cmd) => !cmd.mode || cmd.mode === mode);
  }
  if (!query) return commands;
  const lower = query.toLowerCase();
  const matches = commands.filter((cmd) =>
    cmd.label.toLowerCase().startsWith(lower) ||
    cmd.description.toLowerCase().includes(lower) ||
    cmd.category.toLowerCase().includes(lower) ||
    cmd.aliases?.some((a) => a.toLowerCase().startsWith(lower))
  );
  matches.sort((a, b) => {
    const aAlias = a.aliases?.some((al) => al.toLowerCase() === lower) ? -1 : 0;
    const bAlias = b.aliases?.some((al) => al.toLowerCase() === lower) ? -1 : 0;
    if (aAlias !== bAlias) return aAlias - bAlias;
    const aStarts = a.label.toLowerCase().startsWith(lower) ? 0 : 1;
    const bStarts = b.label.toLowerCase().startsWith(lower) ? 0 : 1;
    return aStarts - bStarts;
  });
  return matches;
}
