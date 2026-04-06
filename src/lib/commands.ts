import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

export interface Command {
  id: string;
  noteId: string;
  line: number;
  instruction: string;
  confirmation: string;
  status: string;
  createdAt: Date;
}

export async function createCommand(input: {
  noteId: string;
  line: number;
  instruction: string;
}, db: PrismaClient = defaultPrisma): Promise<Command> {
  return db.command.create({
    data: {
      noteId: input.noteId,
      line: input.line,
      instruction: input.instruction,
      status: "pending",
    },
  });
}

export async function updateCommand(
  id: string,
  input: { confirmation?: string; status?: string },
  db: PrismaClient = defaultPrisma
): Promise<Command> {
  const data: Record<string, unknown> = {};
  if (input.confirmation !== undefined) data.confirmation = input.confirmation;
  if (input.status !== undefined) data.status = input.status;
  return db.command.update({ where: { id }, data });
}

export async function getCommandsForNote(noteId: string, db: PrismaClient = defaultPrisma): Promise<Command[]> {
  return db.command.findMany({
    where: { noteId },
    orderBy: { line: "asc" },
  });
}

export async function deleteCommandsForNote(noteId: string, db: PrismaClient = defaultPrisma): Promise<void> {
  await db.command.deleteMany({ where: { noteId } });
}
