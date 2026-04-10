import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { readOnlyVaultTools, executeTool } from "@/lib/ai-tools";
import { getNote, conditionalUpdateNote, updateNote } from "@/lib/notes";
import { getPersonByAlias, addNotePerson } from "@/lib/people";
import { loadEmbeddingCache, embedNote } from "@/lib/embeddings";
import { createUserInsights } from "@/lib/user-insights";
import { extractInlineTags } from "@/lib/tags";

const anthropic = new Anthropic();
const MAX_TOOL_ROUNDS = 8;

interface ThinkResult {
  connections: string;
  insights: Array<{ category: string; content: string; evidence?: string }>;
  peopleInsights?: Array<{ name: string; observation: string }>;
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const cookie = request.headers.get("cookie") ?? "";
  const { noteId } = await request.json();

  const note = await getNote(noteId, db);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }

  const snapshotUpdatedAt = note.updatedAt.getTime();

  // Pre-load embedding cache for multi-query efficiency
  const embeddingCache = await loadEmbeddingCache(db);

  const systemPrompt = `You are a deep reasoning engine for a personal knowledge base called Obsid. Your job is to find meaningful connections between the current note and other notes in the vault.

## Current note
Title: ${note.title}
Content:
${note.content}

## Your task
Explore the vault using the tools available to you. Search by meaning, by people, by tags, by time, and by following wiki-links. Read promising notes in full. Then identify connections that the user might not see themselves.

## Connection types to look for
- **Contradictions**: The user said X here but Y in another note
- **Evolution**: Their thinking on a topic shifted over time
- **Recurring patterns**: The same dynamic or tension appearing across notes
- **Unresolved tensions**: Questions or conflicts they keep circling without resolving
- **Causal chains**: A decision in one note led to an outcome in another

## How to explore
1. Start by thinking about what this note is really about — the themes beneath the surface
2. Search semantically for related notes
3. Search by people mentioned, tags used, and time period
4. Follow wiki-links to discover the note's neighborhood
5. Read the most promising notes in full
6. Think carefully about HOW they connect — not just that they're similar

## Output format
Return valid JSON (no markdown fences):
{
  "connections": "Markdown text with [[wiki-links]] explaining each connection and WHY it matters. Use bullet points.",
  "insights": [{"category": "behavior|self-reflection|expertise|thinking-pattern", "content": "insight text", "evidence": "quote from note"}],
  "peopleInsights": [{"name": "Person Name", "observation": "what you discovered about this person across notes"}]
}

The connections text should be specific and reference note content. Not "these notes are related" but "in [[Note X]] you described feeling Y, and here you're experiencing the same tension from a different angle."

peopleInsights should capture observations about specific people — patterns in how the user interacts with them, how the person's role or behavior appears across notes. Use the person's primary name as listed in the known people list.

If you find no meaningful connections, return: {"connections": "", "insights": [], "peopleInsights": []}`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: "Find deep connections between this note and the rest of my vault. Use the tools to explore thoroughly.",
    },
  ];

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      system: systemPrompt,
      tools: readOnlyVaultTools,
      messages,
      thinking: {
        type: "enabled",
        budget_tokens: 5000,
      },
    });
  } catch (err) {
    console.error("[think] AI request failed:", err);
    return Response.json({ error: "AI request failed" }, { status: 502 });
  }

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
            { sourceNoteId: noteId, embeddingCache, cookie },
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
        max_tokens: 16000,
        system: systemPrompt,
        tools: readOnlyVaultTools,
        messages,
        thinking: {
          type: "enabled",
          budget_tokens: 5000,
        },
      });
    } catch (err) {
      console.error("[think] AI request failed during tool loop:", err);
      return Response.json({ error: "AI request failed" }, { status: 502 });
    }
  }

  // If we hit the tool round limit and the last response was still tool_use,
  // force a final call WITHOUT tools so Claude must produce text output.
  if (response.stop_reason === "tool_use") {
    console.log("[think] Hit tool round limit, forcing final response");
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    const toolBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    // Return empty results for pending tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = toolBlocks.map((block) => ({
      type: "tool_result" as const,
      tool_use_id: block.id,
      content: "Tool limit reached. Please synthesize your findings and return the JSON response now.",
    }));
    messages.push({ role: "user", content: toolResults });

    try {
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages,
        thinking: {
          type: "enabled",
          budget_tokens: 2000,
        },
      });
    } catch (err) {
      console.error("[think] Final forced response failed:", err);
      return Response.json({ error: "AI request failed" }, { status: 502 });
    }
  }

  // Extract final text
  let resultText = "";
  for (const block of response.content) {
    if (block.type === "text") resultText += block.text;
  }

  console.log(`[think] stop_reason=${response.stop_reason}, toolRounds=${toolRounds}, textLength=${resultText.length}, blocks=${response.content.map((b) => b.type).join(",")}`);

  // Strip markdown fences if present
  resultText = resultText
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // Extract JSON from response — Claude sometimes writes preamble text before the JSON
  const jsonMatch = resultText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    resultText = jsonMatch[0];
  }

  // Empty response — AI used all tokens on thinking/tools and produced no output
  if (!resultText) {
    console.warn("[think] Empty response from AI");
    return Response.json({
      connectionsAdded: false,
      insightsAdded: 0,
      connections: "",
    });
  }

  let result: ThinkResult;
  try {
    result = JSON.parse(resultText);
  } catch {
    // AI returned text instead of JSON — likely no meaningful connections found.
    // Return gracefully instead of 500.
    console.warn("[think] AI returned non-JSON response:", resultText.slice(0, 200));
    return Response.json({
      connectionsAdded: false,
      insightsAdded: 0,
      connections: "",
    });
  }

  // Append connections to note content
  let connectionsAdded = false;
  if (result.connections && result.connections.trim()) {
    // Re-fetch note to get current content and updatedAt — the client may have
    // saved content before calling /think, bumping updatedAt since our initial fetch.
    const freshNote = await getNote(noteId, db);
    if (!freshNote) {
      return Response.json({ error: "Note not found" }, { status: 404 });
    }
    const connectionsSection = `\n\n---\n**Connections**\n${result.connections.trim()}\n`;
    const updatedContent = freshNote.content.trimEnd() + connectionsSection;
    const finalTags = extractInlineTags(updatedContent);

    const updated = await conditionalUpdateNote(
      noteId,
      freshNote.updatedAt,
      { content: updatedContent, tags: finalTags },
      db
    );

    if (updated) {
      connectionsAdded = true;
      // Re-embed with connections included
      embedNote(noteId, note.title, updatedContent, db, note.summary).catch(
        (err) => console.error("[think] embedNote failed:", err)
      );
    }
  }

  // Store user insights
  let insightsAdded = 0;
  if (result.insights && result.insights.length > 0) {
    const created = await createUserInsights(
      result.insights.map((i) => ({
        category: i.category,
        content: i.content,
        evidence: i.evidence ?? "",
        sourceNoteId: noteId,
        source: "think",
      })),
      db
    );
    insightsAdded = created.length;
  }

  // Route people insights to person notes
  let peopleInsightsAdded = 0;
  if (result.peopleInsights && result.peopleInsights.length > 0) {
    for (const pi of result.peopleInsights) {
      const person = await getPersonByAlias(pi.name, db);
      if (!person) continue;

      const existingNote = await getNote(person.note.id, db);
      if (!existingNote) continue;

      const timestamp = new Date().toISOString().split("T")[0];
      const appendText = `\n\n_${timestamp} (think):_ ${pi.observation}`;
      await updateNote(person.note.id, { content: existingNote.content + appendText }, db);
      // Record the note-person link (matching update_person pattern in ai-tools.ts)
      await addNotePerson(noteId, person.note.id, db);
      peopleInsightsAdded++;

      // Fire-and-forget person summary regeneration
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/ai/person-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify({ personNoteId: person.note.id }),
      }).catch(() => {});
    }
  }

  return Response.json({
    connectionsAdded,
    insightsAdded,
    peopleInsightsAdded,
    connections: result.connections || "",
  });
}
