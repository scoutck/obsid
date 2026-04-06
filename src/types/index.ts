export interface CommandData {
  id: string;
  line: number;
  instruction: string;
  confirmation: string;
  status: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  type: string;
  links: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonMeta {
  id: string;
  noteId: string;
  aliases: string[];
  role: string;
  summary: string;
  userContext: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotePerson {
  noteId: string;
  personNoteId: string;
  highlight: string;
}

export interface Collection {
  id: string;
  name: string;
  filter: CollectionFilter;
  createdAt: Date;
}

export interface CollectionFilter {
  tags?: string[];
  type?: string;
  dateRange?: "today" | "this-week" | "this-month" | "all";
  query?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  createdAt: Date;
}

export interface PendingPerson {
  id: string;
  name: string;
  sourceNoteId: string | null;
  sourceConversationId: string | null;
  context: string;
  status: "pending" | "confirmed" | "dismissed";
  createdAt: Date;
}

export function parseNote(raw: {
  id: string;
  title: string;
  content: string;
  tags: string;
  type: string;
  links: string;
  unresolvedPeople?: string;
  createdAt: Date;
  updatedAt: Date;
}): Note {
  return {
    id: raw.id,
    title: raw.title,
    content: raw.content,
    tags: JSON.parse(raw.tags),
    type: raw.type,
    links: JSON.parse(raw.links),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function parsePersonMeta(raw: {
  id: string;
  noteId: string;
  aliases: string;
  role: string;
  summary: string;
  userContext: string;
  createdAt: Date;
  updatedAt: Date;
}): PersonMeta {
  return {
    ...raw,
    aliases: JSON.parse(raw.aliases),
  };
}

export function parseCollection(raw: {
  id: string;
  name: string;
  filter: string;
  createdAt: Date;
}): Collection {
  return {
    ...raw,
    filter: JSON.parse(raw.filter),
  };
}

export function parseChatMessage(raw: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: string;
  createdAt: Date;
}): ChatMessage {
  return {
    ...raw,
    role: raw.role as "user" | "assistant",
    toolCalls: JSON.parse(raw.toolCalls),
  };
}
