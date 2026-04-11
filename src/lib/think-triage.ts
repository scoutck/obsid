import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

export interface ThinkTriage {
  id: string;
  noteId: string;
  worthy: boolean;
  reason: string;
  triagedAt: Date;
}

export async function upsertTriage(
  noteId: string,
  worthy: boolean,
  reason: string,
  db: PrismaClient = defaultPrisma
): Promise<ThinkTriage> {
  const existing = await db.noteThinkTriage.findUnique({ where: { noteId } });
  if (existing) {
    const raw = await db.noteThinkTriage.update({
      where: { noteId },
      data: { worthy, reason, triagedAt: new Date().toISOString() },
    });
    return raw as ThinkTriage;
  }
  const raw = await db.noteThinkTriage.create({
    data: { noteId, worthy, reason },
  });
  return raw as ThinkTriage;
}

export async function getTriageForNote(
  noteId: string,
  db: PrismaClient = defaultPrisma
): Promise<ThinkTriage | null> {
  const raw = await db.noteThinkTriage.findUnique({ where: { noteId } });
  return raw as ThinkTriage | null;
}

export async function getTriagesForNotes(
  noteIds: string[],
  db: PrismaClient = defaultPrisma
): Promise<Map<string, ThinkTriage>> {
  if (noteIds.length === 0) return new Map();
  const rows = await db.noteThinkTriage.findMany({
    where: { noteId: { in: noteIds } },
  });
  const map = new Map<string, ThinkTriage>();
  for (const row of rows) {
    map.set(row.noteId, row as ThinkTriage);
  }
  return map;
}

export async function deleteTriageForNote(
  noteId: string,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await db.noteThinkTriage.deleteMany({ where: { noteId } });
}

const TRIAGE_PROMPT = `You are evaluating whether a note has enough substance for deep analysis that finds connections to other notes in a knowledge base.

Return valid JSON (no markdown fences): {"worthy": true/false, "reason": "brief explanation"}

Answer NO only for notes that are truly trivial with no analytical value:
- Bare grocery/shopping lists with no context
- Empty stubs with just a title and no content
- Template boilerplate with no user content

Answer YES for everything else, including:
- To-do lists (reveal how the user organizes work)
- Logistics/planning notes (reveal decision-making patterns)
- Short notes with opinions, reflections, or questions
- Notes about people, events, or decisions
- Any note where the user expresses a perspective, feeling, or intention`;

export async function triageNote(
  title: string,
  content: string
): Promise<{ worthy: boolean; reason: string }> {
  const anthropic = new Anthropic();
  const truncated = content.slice(0, 2000);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Evaluate this note:\n\nTitle: ${title}\n\n${truncated}`,
      },
    ],
    system: TRIAGE_PROMPT,
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  text = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    const result = JSON.parse(text);
    return {
      worthy: Boolean(result.worthy),
      reason: String(result.reason ?? ""),
    };
  } catch {
    // If Haiku fails to return JSON, default to worthy (permissive)
    return { worthy: true, reason: "Triage parse failed — defaulting to worthy" };
  }
}
