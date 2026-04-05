import { prisma } from "@/lib/db";

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
}): Promise<Command> {
  return prisma.command.create({
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
  input: { confirmation?: string; status?: string }
): Promise<Command> {
  const data: Record<string, unknown> = {};
  if (input.confirmation !== undefined) data.confirmation = input.confirmation;
  if (input.status !== undefined) data.status = input.status;
  return prisma.command.update({ where: { id }, data });
}

export async function getCommandsForNote(noteId: string): Promise<Command[]> {
  return prisma.command.findMany({
    where: { noteId },
    orderBy: { line: "asc" },
  });
}

export async function deleteCommandsForNote(noteId: string): Promise<void> {
  await prisma.command.deleteMany({ where: { noteId } });
}
