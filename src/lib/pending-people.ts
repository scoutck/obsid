import { prisma } from "@/lib/db";
import type { PendingPerson } from "@/types";

interface CreatePendingPersonInput {
  name: string;
  sourceNoteId?: string;
  sourceConversationId?: string;
  context: string;
}

export async function createPendingPerson(
  input: CreatePendingPersonInput
): Promise<PendingPerson> {
  // Deduplicate: skip if same name + same source already pending
  const existing = await prisma.pendingPerson.findFirst({
    where: {
      name: input.name,
      status: "pending",
      ...(input.sourceNoteId ? { sourceNoteId: input.sourceNoteId } : {}),
      ...(input.sourceConversationId
        ? { sourceConversationId: input.sourceConversationId }
        : {}),
    },
  });

  if (existing) return existing as unknown as PendingPerson;

  const raw = await prisma.pendingPerson.create({
    data: {
      name: input.name,
      sourceNoteId: input.sourceNoteId ?? null,
      sourceConversationId: input.sourceConversationId ?? null,
      context: input.context,
    },
  });

  return raw as unknown as PendingPerson;
}

export async function listPendingPeople(): Promise<PendingPerson[]> {
  const raw = await prisma.pendingPerson.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return raw as unknown as PendingPerson[];
}

export async function updatePendingPersonStatus(
  id: string,
  status: "confirmed" | "dismissed"
): Promise<void> {
  await prisma.pendingPerson.update({
    where: { id },
    data: { status },
  });
}

export async function dismissPendingPerson(id: string): Promise<void> {
  await updatePendingPersonStatus(id, "dismissed");
}
