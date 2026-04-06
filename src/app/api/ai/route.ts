import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { vaultTools, executeTool } from "@/lib/ai-tools";

const anthropic = new Anthropic();

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

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    tools: vaultTools,
    messages,
  });

  // Handle tool use loop
  while (response.stop_reason === "tool_use") {
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of assistantContent) {
      if (block.type === "tool_use") {
        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          { cookie },
          db
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

  for (const block of response.content) {
    if (block.type === "text") {
      finalText += block.text;
    }
  }

  return new Response(finalText, {
    headers: { "Content-Type": "text/plain" },
  });
}
