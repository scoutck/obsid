import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import type { Conversation, ChatMessage } from "@/types";
import { parseChatMessage } from "@/types";

export async function createConversation(title: string = "", db: PrismaClient = defaultPrisma): Promise<Conversation> {
  const raw = await db.conversation.create({
    data: { title },
  });
  return raw as Conversation;
}

export async function getConversation(id: string, db: PrismaClient = defaultPrisma): Promise<Conversation | null> {
  const raw = await db.conversation.findUnique({ where: { id } });
  if (!raw) return null;
  return raw as Conversation;
}

export async function getMostRecentConversation(db: PrismaClient = defaultPrisma): Promise<Conversation | null> {
  const rows = await db.$queryRawUnsafe<
    Array<{ id: string; title: string; createdAt: string; updatedAt: string }>
  >(`SELECT * FROM "Conversation" ORDER BY updatedAt DESC, rowid DESC LIMIT 1`);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    title: r.title,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}

export async function updateConversationTitle(id: string, title: string, db: PrismaClient = defaultPrisma): Promise<void> {
  await db.conversation.update({
    where: { id },
    data: { title },
  });
}

export async function addMessage(
  conversationId: string,
  role: string,
  content: string,
  toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [],
  db: PrismaClient = defaultPrisma
): Promise<ChatMessage> {
  const raw = await db.message.create({
    data: {
      conversationId,
      role,
      content,
      toolCalls: JSON.stringify(toolCalls),
    },
  });

  // Touch conversation updatedAt
  await db.conversation.update({
    where: { id: conversationId },
    data: {},
  });

  return parseChatMessage(raw);
}

export async function getMessages(
  conversationId: string,
  limit: number = 20,
  db: PrismaClient = defaultPrisma
): Promise<ChatMessage[]> {
  // Get the N most recent messages (by insertion order), then return in chronological order
  const rows = await db.$queryRawUnsafe<
    Array<{
      id: string;
      conversationId: string;
      role: string;
      content: string;
      toolCalls: string;
      createdAt: string;
    }>
  >(
    `SELECT * FROM (SELECT rowid, * FROM "Message" WHERE conversationId = ? ORDER BY createdAt DESC, rowid DESC LIMIT ?) ORDER BY rowid ASC`,
    conversationId,
    limit
  );

  return rows.map((r) =>
    parseChatMessage({
      ...r,
      createdAt: new Date(r.createdAt),
    })
  );
}
