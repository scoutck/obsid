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

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseJson<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
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
    tags: safeParseArray(raw.tags),
    type: raw.type,
    links: safeParseArray(raw.links),
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
    aliases: safeParseArray(raw.aliases),
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
    filter: safeParseJson(raw.filter, {}),
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
    toolCalls: safeParseJson(raw.toolCalls, []),
  };
}

export interface UserInsight {
  id: string;
  category: "self-reflection" | "expertise" | "behavior" | "thinking-pattern";
  content: string;
  evidence: string;
  sourceNoteId: string | null;
  createdAt: Date;
}

export function parseUserInsight(raw: {
  id: string;
  category: string;
  content: string;
  evidence: string;
  sourceNoteId: string | null;
  createdAt: Date;
}): UserInsight {
  return {
    ...raw,
    category: raw.category as UserInsight["category"],
  };
}

export { type Task, parseTask } from "./task";
