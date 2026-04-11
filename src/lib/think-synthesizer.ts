import Anthropic from "@anthropic-ai/sdk";
import type { ExplorerResult, ExplorationPlan } from "@/lib/think-explorers";

export interface ThinkResult {
  connections: string;
  insights: Array<{ category: string; content: string; evidence?: string }>;
  peopleInsights?: Array<{ name: string; observation: string }>;
}

export function buildSynthesisMessages(
  noteTitle: string,
  noteContent: string,
  plan: ExplorationPlan,
  explorerResults: ExplorerResult[],
  knownPeople: string[]
): { system: string; messages: Anthropic.MessageParam[] } {
  const explorerSummaries = explorerResults
    .map((r) => `### ${r.explorer.charAt(0).toUpperCase() + r.explorer.slice(1)} Explorer\n${r.summary}`)
    .join("\n\n");

  const system = `You are a deep reasoning engine for a personal knowledge base called Obsid. You have received exploration results from four specialized agents that searched the vault on your behalf. Your job is to synthesize their findings into meaningful connections.

## Current note
Title: ${noteTitle}
Content:
${noteContent}

## Exploration plan
${JSON.stringify(plan, null, 2)}

## Explorer findings
${explorerSummaries}

## Known people
${knownPeople.length > 0 ? knownPeople.join(", ") : "None tracked yet"}

## Your task
Analyze the explorer findings deeply. Do NOT just summarize what the explorers found — look for patterns, contradictions, and connections BETWEEN their findings that no single explorer could see.

## Connection types to find
1. **Contradictions** — the user said X here but Y in another note
2. **Evolution** — thinking on a topic shifted over time
3. **Recurring patterns** — same tension or dynamic across notes
4. **Unresolved tensions** — questions or conflicts circled without resolution
5. **Causal chains** — a decision in one note led to an outcome in another

## Output format
Return valid JSON (no markdown fences):
{
  "connections": "Markdown text with [[wiki-links]] explaining each connection and WHY it matters. Use bullet points. Be specific — reference note content, not just titles.",
  "insights": [{"category": "behavior|self-reflection|expertise|thinking-pattern", "content": "insight text", "evidence": "quote from note"}],
  "peopleInsights": [{"name": "Person Name", "observation": "what you discovered about this person across notes"}]
}

If the explorers found nothing meaningful, return: {"connections": "", "insights": [], "peopleInsights": []}

The connections text should be specific. Not "these notes are related" but "in [[Note X]] you described feeling Y, and here you're experiencing the same tension from a different angle."

peopleInsights should use the person's primary name as listed in the known people list.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: "Synthesize the explorer findings into deep connections. Look for what no single explorer could see on its own.",
    },
  ];

  return { system, messages };
}

export async function synthesize(
  noteTitle: string,
  noteContent: string,
  plan: ExplorationPlan,
  explorerResults: ExplorerResult[],
  knownPeople: string[]
): Promise<ThinkResult> {
  const anthropic = new Anthropic();
  const { system, messages } = buildSynthesisMessages(
    noteTitle,
    noteContent,
    plan,
    explorerResults,
    knownPeople
  );

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    system,
    messages,
    thinking: {
      type: "enabled",
      budget_tokens: 10000,
    },
  });

  let resultText = "";
  for (const block of response.content) {
    if (block.type === "text") resultText += block.text;
  }

  // Strip markdown fences if present
  resultText = resultText
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // Extract JSON — Opus sometimes writes preamble
  const jsonMatch = resultText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    resultText = jsonMatch[0];
  }

  if (!resultText) {
    return { connections: "", insights: [], peopleInsights: [] };
  }

  try {
    return JSON.parse(resultText) as ThinkResult;
  } catch {
    console.warn("[think:synthesizer] Non-JSON response:", resultText.slice(0, 200));
    return { connections: "", insights: [], peopleInsights: [] };
  }
}
