/**
 * Migration script: extract /claude commands and ✓/✗ confirmation lines
 * from note content into the Command table, then clean the content.
 *
 * Run with: npx tsx prisma/migrate-commands.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaLibSql({ url });
const prisma = new PrismaClient({ adapter });

interface ExtractedCommand {
  line: number;
  instruction: string;
  confirmation: string;
  status: string;
}

function extractCommands(content: string): {
  commands: ExtractedCommand[];
  cleanedContent: string;
} {
  const lines = content.split("\n");
  const commands: ExtractedCommand[] = [];
  const cleanedLines: string[] = [];
  let currentCommand: ExtractedCommand | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();

    if (trimmed.startsWith("/claude ")) {
      // Start a new command — line number is position in cleaned output
      currentCommand = {
        line: cleanedLines.length + 1, // 1-based, relative to cleaned content
        instruction: trimmed.replace(/^\/claude\s+/, ""),
        confirmation: "",
        status: "done",
      };
      continue; // Don't add to cleaned content
    }

    if (
      currentCommand &&
      (trimmed.startsWith("\u2713 ") || trimmed.startsWith("\u2717 "))
    ) {
      // This is a confirmation line for the current command
      if (trimmed.startsWith("\u2713 ")) {
        currentCommand.confirmation = trimmed.slice(2);
        currentCommand.status = "done";
      } else {
        currentCommand.confirmation = trimmed.slice(2);
        currentCommand.status = "error";
      }
      commands.push(currentCommand);
      currentCommand = null;
      continue; // Don't add to cleaned content
    }

    // If there was a command without a confirmation, save it
    if (currentCommand) {
      commands.push(currentCommand);
      currentCommand = null;
    }

    cleanedLines.push(lines[i]);
  }

  // Handle trailing command without confirmation
  if (currentCommand) {
    commands.push(currentCommand);
  }

  return {
    commands,
    cleanedContent: cleanedLines.join("\n"),
  };
}

async function migrate() {
  const notes = await prisma.note.findMany();
  let totalCommands = 0;
  let notesModified = 0;

  for (const note of notes) {
    const { commands, cleanedContent } = extractCommands(note.content);

    if (commands.length === 0) continue;

    notesModified++;
    totalCommands += commands.length;

    // Create command records
    for (const cmd of commands) {
      await prisma.command.create({
        data: {
          id: randomUUID(),
          noteId: note.id,
          line: cmd.line,
          instruction: cmd.instruction,
          confirmation: cmd.confirmation,
          status: cmd.status,
        },
      });
    }

    // Update the note content
    await prisma.note.update({
      where: { id: note.id },
      data: { content: cleanedContent },
    });

    console.log(
      `  ${note.title || "Untitled"}: extracted ${commands.length} command(s)`
    );
  }

  console.log(
    `\nMigrated ${totalCommands} command(s) from ${notesModified} note(s).`
  );
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
