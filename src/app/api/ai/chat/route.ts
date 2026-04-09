import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { vaultTools, executeTool } from "@/lib/ai-tools";
import {
  addMessage,
  getMessages,
  getConversation,
  updateConversationTitle,
} from "@/lib/conversations";
import { listPeople } from "@/lib/people";

const anthropic = new Anthropic();

const MAX_TOOL_ROUNDS = 10;

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const cookie = request.headers.get("cookie") ?? "";
  const { conversationId, content } = await request.json();

  const conversation = await getConversation(conversationId, db);
  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Save user message
  await addMessage(conversationId, "user", content, [], db);

  // Auto-title from first message
  if (!conversation.title && content) {
    const title = content.slice(0, 60) + (content.length > 60 ? "..." : "");
    await updateConversationTitle(conversationId, title, db);
  }

  // Load conversation history and people context in parallel
  const [history, people] = await Promise.all([
    getMessages(conversationId, 20, db),
    listPeople(db),
  ]);
  const peopleList = people
    .map(
      (p) =>
        `- ${p.note.title} (aliases: ${p.meta.aliases.join(", ")}${p.meta.role ? `, role: ${p.meta.role}` : ""})`
    )
    .join("\n");

  const systemPrompt = `You are Claude, an AI assistant in a personal knowledge base called Obsid. The user is chatting with you to manage their knowledge — they'll share observations, ask questions, and request actions.

## Your capabilities
- Search notes by meaning (semantic search)
- Read, create, and update notes
- Track people and relationships
- Flag new people for the user to confirm

## Known people
${peopleList || "(none yet)"}

## How to handle requests
- **Observations** ("Sarah is worried about Q2"): Use update_person to save to that person's note. If the person doesn't exist, use create_pending_person.
- **Questions** ("What did John say about the timeline?"): Use semantic_search to find relevant notes, then answer.
- **Actions** ("Create a note about the budget"): Use create_note or update_note.
- **General chat**: Respond naturally, using tools when helpful.

Be concise and helpful. When you use tools, briefly confirm what you did.`;

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

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
    console.error("[chat] AI request failed:", err);
    return Response.json({ error: "AI request failed" }, { status: 502 });
  }

  // Tool-use loop
  const fullMessages = [...messages];
  const allToolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  let toolRounds = 0;
  while (response.stop_reason === "tool_use" && toolRounds < MAX_TOOL_ROUNDS) {
    toolRounds++;
    const assistantContent = response.content;
    fullMessages.push({ role: "assistant", content: assistantContent });

    const toolBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolBlocks.map(async (block) => {
        try {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            { sourceConversationId: conversationId, cookie },
            db
          );
          allToolCalls.push({
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
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

    fullMessages.push({ role: "user", content: toolResults });

    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        tools: vaultTools,
        messages: fullMessages,
      });
    } catch (err) {
      console.error("[chat] AI request failed in tool loop:", err);
      return Response.json({ error: "AI request failed" }, { status: 502 });
    }
  }

  // Extract final text
  let finalText = "";
  for (const block of response.content) {
    if (block.type === "text") finalText += block.text;
  }

  // Save assistant response with tool calls for transparency
  await addMessage(conversationId, "assistant", finalText, allToolCalls, db);

  return Response.json({ content: finalText });
}
