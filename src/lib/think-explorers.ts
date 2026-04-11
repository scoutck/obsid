import Anthropic from "@anthropic-ai/sdk";
import { readOnlyVaultTools, executeTool } from "@/lib/ai-tools";
import type { EmbeddingCache } from "@/lib/embeddings";
import type { PrismaClient } from "@prisma/client";

export interface ExplorationPlan {
  semanticQueries: string[];
  people: string[];
  timePeriods: Array<{ start: string; end: string; why: string }>;
  wikiLinks: string[];
  questions: string[];
}

export interface ExplorerResult {
  explorer: "semantic" | "people" | "temporal" | "graph";
  summary: string;
}

const MAX_EXPLORER_ROUNDS = 4;

async function runExplorer(
  explorerType: "semantic" | "people" | "temporal" | "graph",
  systemPrompt: string,
  userMessage: string,
  meta: { sourceNoteId: string; embeddingCache?: EmbeddingCache; cookie?: string },
  db: PrismaClient
): Promise<ExplorerResult> {
  const anthropic = new Anthropic();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system: systemPrompt,
    tools: readOnlyVaultTools,
    messages,
  });

  let rounds = 0;
  while (response.stop_reason === "tool_use" && rounds < MAX_EXPLORER_ROUNDS) {
    rounds++;
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
            meta,
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

    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: systemPrompt,
      tools: readOnlyVaultTools,
      messages,
    });
  }

  // If still in tool_use after max rounds, force final response
  if (response.stop_reason === "tool_use") {
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });
    const toolBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = toolBlocks.map((block) => ({
      type: "tool_result" as const,
      tool_use_id: block.id,
      content: "Tool limit reached. Return your summary now.",
    }));
    messages.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages,
    });
  }

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  return { explorer: explorerType, summary: text.trim() || "No findings." };
}

function buildSemanticPrompt(noteTitle: string, noteContent: string, plan: ExplorationPlan): { system: string; user: string } {
  const queryHints = plan.semanticQueries.length > 0
    ? `\n\nSuggested search angles: ${plan.semanticQueries.join("; ")}`
    : "";

  return {
    system: `You are a semantic explorer for a personal knowledge base. Your job is to find notes related by MEANING to the current note.

Use semantic_search with different query angles — themes, emotions, underlying tensions. Read the top 3-5 most relevant notes in full.

Return a structured summary (not raw tool output):
- For each related note: title, [[wiki-link format]], WHY it's relevant, key quotes
- Potential connection types: contradiction, evolution, recurring pattern, unresolved tension, causal chain
- Keep your summary under 800 words.`,
    user: `Find notes semantically related to this note:\n\nTitle: ${noteTitle}\n\n${noteContent}${queryHints}`,
  };
}

function buildPeoplePrompt(noteTitle: string, noteContent: string, plan: ExplorationPlan): { system: string; user: string } {
  return {
    system: `You are a people explorer for a personal knowledge base. Your job is to investigate people mentioned in or related to the current note.

Use list_people to see who's tracked. Use search_by_person to find notes mentioning them. Read relevant notes to understand relationship patterns.

Return a structured summary (not raw tool output):
- For each relevant person: name, how they appear across notes, relationship patterns, behavioral observations
- Highlight any changes in how the user relates to or perceives this person over time
- Keep your summary under 800 words.`,
    user: `Investigate people related to this note:\n\nTitle: ${noteTitle}\n\n${noteContent}\n\nPeople to investigate: ${plan.people.length > 0 ? plan.people.join(", ") : "Identify from context"}`,
  };
}

function buildTemporalPrompt(noteTitle: string, noteContent: string, plan: ExplorationPlan): { system: string; user: string } {
  const timeContext = plan.timePeriods.length > 0
    ? plan.timePeriods.map((t) => `${t.start} to ${t.end}: ${t.why}`).join("\n")
    : "Identify relevant time periods from the note's context.";

  return {
    system: `You are a temporal explorer for a personal knowledge base. Your job is to find how thinking on this note's topics has evolved over time.

Use search_by_timeframe to find notes from relevant periods. Read them to understand shifts in perspective.

Return a structured summary (not raw tool output):
- Timeline of related notes with dates
- Identified shifts in perspective or approach
- Before/after patterns — how the user's stance changed
- Keep your summary under 800 words.`,
    user: `Find the temporal context for this note:\n\nTitle: ${noteTitle}\n\n${noteContent}\n\nTime periods to investigate:\n${timeContext}`,
  };
}

function buildGraphPrompt(noteTitle: string, noteContent: string, noteId: string, plan: ExplorationPlan): { system: string; user: string } {
  return {
    system: `You are a graph explorer for a personal knowledge base. Your job is to follow [[wiki-links]] and map the note's neighborhood.

Use get_note_graph to follow links. Read linked notes that look promising. Use read_note to go deeper on surprising connections.

Return a structured summary (not raw tool output):
- Neighborhood map: which notes are linked and how
- Thematically surprising linked notes (linked but about something unexpected)
- Clusters of tightly-linked notes
- Keep your summary under 800 words.`,
    user: `Map the link neighborhood of this note:\n\nTitle: ${noteTitle}\nNote ID: ${noteId}\n\n${noteContent}\n\nWiki-links to investigate: ${plan.wikiLinks.length > 0 ? plan.wikiLinks.join(", ") : "Follow links found in content"}`,
  };
}

export async function runAllExplorers(
  noteId: string,
  noteTitle: string,
  noteContent: string,
  plan: ExplorationPlan,
  meta: { embeddingCache?: EmbeddingCache; cookie?: string },
  db: PrismaClient
): Promise<ExplorerResult[]> {
  const sharedMeta = { sourceNoteId: noteId, ...meta };

  const semanticPrompt = buildSemanticPrompt(noteTitle, noteContent, plan);
  const peoplePrompt = buildPeoplePrompt(noteTitle, noteContent, plan);
  const temporalPrompt = buildTemporalPrompt(noteTitle, noteContent, plan);
  const graphPrompt = buildGraphPrompt(noteTitle, noteContent, noteId, plan);

  const results = await Promise.all([
    runExplorer("semantic", semanticPrompt.system, semanticPrompt.user, sharedMeta, db)
      .catch((err) => {
        console.error("[think:semantic-explorer] failed:", err);
        return { explorer: "semantic" as const, summary: "Explorer failed." };
      }),
    runExplorer("people", peoplePrompt.system, peoplePrompt.user, sharedMeta, db)
      .catch((err) => {
        console.error("[think:people-explorer] failed:", err);
        return { explorer: "people" as const, summary: "Explorer failed." };
      }),
    runExplorer("temporal", temporalPrompt.system, temporalPrompt.user, sharedMeta, db)
      .catch((err) => {
        console.error("[think:temporal-explorer] failed:", err);
        return { explorer: "temporal" as const, summary: "Explorer failed." };
      }),
    runExplorer("graph", graphPrompt.system, graphPrompt.user, sharedMeta, db)
      .catch((err) => {
        console.error("[think:graph-explorer] failed:", err);
        return { explorer: "graph" as const, summary: "Explorer failed." };
      }),
  ]);

  return results;
}
