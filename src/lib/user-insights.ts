import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import { parseUserInsight, type UserInsight } from "@/types";

interface CreateUserInsightInput {
  category: string;
  content: string;
  evidence?: string;
  sourceNoteId?: string;
}

const VALID_CATEGORIES = ["self-reflection", "expertise", "behavior", "thinking-pattern"];

export async function createUserInsight(
  input: CreateUserInsightInput,
  db: PrismaClient = defaultPrisma
): Promise<UserInsight> {
  const category = VALID_CATEGORIES.includes(input.category) ? input.category : "self-reflection";
  const raw = await db.userInsight.create({
    data: {
      category,
      content: input.content,
      evidence: input.evidence ?? "",
      sourceNoteId: input.sourceNoteId ?? null,
    },
  });
  return parseUserInsight(raw);
}

export async function createUserInsights(
  inputs: CreateUserInsightInput[],
  db: PrismaClient = defaultPrisma
): Promise<UserInsight[]> {
  if (inputs.length === 0) return [];

  const results: UserInsight[] = [];
  for (const input of inputs) {
    results.push(await createUserInsight(input, db));
  }
  return results;
}

export async function getUserInsights(
  db: PrismaClient = defaultPrisma
): Promise<UserInsight[]> {
  const rows = await db.userInsight.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(parseUserInsight);
}

export async function getUserInsightsByCategory(
  category: string,
  db: PrismaClient = defaultPrisma
): Promise<UserInsight[]> {
  const rows = await db.userInsight.findMany({
    where: { category },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(parseUserInsight);
}

export async function deleteUserInsight(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await db.userInsight.delete({ where: { id } });
}
