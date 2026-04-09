import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { vaultTools, executeTool } from "@/lib/ai-tools";

const anthropic = new Anthropic();

const MAX_TOOL_ROUNDS = 10;

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const cookie = request.headers.get("cookie") ?? "";
  const { prompt, currentNoteContent } = await request.json();

  const systemPrompt = `You are an AI assistant embedded in a markdown knowledge base called Obsid. You help the user with their notes — searching, summarizing, creating, and updating them.

You have access to the user's vault through tools. Use them to answer questions about their notes.

## Person notes
Some notes have type "person" — these track people the user knows. Each person note has a name (the title), freeform observations (the content), and metadata (aliases, role). When the user asks you to "save this about [person]" or "note that [person] prefers X", use list_people to find the person, then update_note with append mode to add to their person note.

## Tags
Notes use inline #tags in their content. Tags are extracted automatically. When discussing notes, reference their tags.

The user is currently editing a note with the following content:
---
${currentNoteContent || "(empty note)"}
---

Respond concisely. Use markdown formatting.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  let finalText = "";

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: vaultTools,
      messages,
    });
  } catch (err) {
    console.error("[ask] AI request failed:", err);
    return new Response("AI request failed", { status: 502 });
  }

  // Handle tool use loop
  let toolRounds = 0;
  while (response.stop_reason === "tool_use" && toolRounds < MAX_TOOL_ROUNDS) {
    toolRounds++;
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolBlocks.map(async (block) => {
        try {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            { cookie },
            db
          );
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: result,
          };
        } catch (err) {
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: `Error: ${err instanceof Error ? err.message : "Tool execution failed"}`,
            is_error: true,
          };
        }
      })
    );

    messages.push({ role: "user", content: toolResults });

    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        tools: vaultTools,
        messages,
      });
    } catch (err) {
      console.error("[ask] AI request failed in tool loop:", err);
      return new Response("AI request failed", { status: 502 });
    }
  }

  for (const block of response.content) {
    if (block.type === "text") {
      finalText += block.text;
    }
  }

  return new Response(finalText, {
    headers: { "Content-Type": "text/plain" },
  });
}
