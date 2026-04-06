import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { vaultTools, executeTool } from "@/lib/ai-tools";
import { createCommand, updateCommand } from "@/lib/commands";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  const { instruction, noteId, noteContent, noteTitle, cursorPosition, line } =
    await request.json();

  // Extract context around cursor (5 lines before and after)
  const lines = noteContent.split("\n");
  let cursorLine = 0;
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    charCount += lines[i].length + 1;
    if (charCount >= cursorPosition) {
      cursorLine = i;
      break;
    }
  }
  const contextStart = Math.max(0, cursorLine - 5);
  const contextEnd = Math.min(lines.length, cursorLine + 6);
  const cursorContext = lines.slice(contextStart, contextEnd).join("\n");

  const systemPrompt = `You are an AI assistant in a markdown knowledge base called Obsid. The user has given you an inline instruction while editing a note.

Current note: "${noteTitle}"
Full content:
${noteContent}

Content around cursor:
${cursorContext}

You have tools to search, read, create, and update notes. Execute the user's instruction and return a SHORT confirmation (under 50 chars). Do not use markdown in your final response. Just a brief confirmation like "saved to Sarah Chen's note" or "tagged as risk".`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: instruction },
  ];

  // Create the command record up front
  const command = await createCommand({
    noteId,
    line: line ?? 0,
    instruction,
  });

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: vaultTools,
      messages,
    });

    while (response.stop_reason === "tool_use") {
      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            { sourceNoteId: noteId }
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        tools: vaultTools,
        messages,
      });
    }
  } catch (err) {
    console.error("[command] AI request failed:", err);
    await updateCommand(command.id, {
      confirmation: "AI request failed",
      status: "error",
    });
    return Response.json({ error: "AI request failed" }, { status: 502 });
  }

  let finalText = "";
  for (const block of response.content) {
    if (block.type === "text") finalText += block.text;
  }

  const confirmation = finalText.trim();
  const updated = await updateCommand(command.id, {
    confirmation,
    status: "done",
  });

  return Response.json(updated);
}
