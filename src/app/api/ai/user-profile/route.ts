import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getUserInsights } from "@/lib/user-insights";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const insights = await getUserInsights(db);

  if (insights.length === 0) {
    return Response.json({
      summary: "",
      expertise: [],
      patterns: [],
      thinkingStyle: "",
    });
  }

  const insightText = insights
    .map((i) => `[${i.category}] ${i.content}${i.evidence ? ` (evidence: "${i.evidence}")` : ""}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `You synthesize user insights into a structured profile. You are analyzing observations collected from a user's personal knowledge base — things they've written that reveal who they are, how they think, and what they know.

Return valid JSON only, no markdown wrapping. Use this format:
{
  "summary": "2-3 sentence paragraph about who this person is, written in second person (you)",
  "expertise": [{"topic": "name", "strength": "deep|moderate|emerging"}],
  "patterns": [{"label": "short label", "description": "1 sentence description"}],
  "thinkingStyle": "1-2 sentences about how this person approaches problems and organizes ideas"
}

Rules:
- Only include expertise/patterns with enough supporting evidence
- If an insight appears multiple times, that strengthens confidence
- Write warmly but honestly — this is for the user to see about themselves
- "strength" reflects how many insights support the topic and how detailed they are`,
    messages: [
      {
        role: "user",
        content: `Here are ${insights.length} observations collected from the user's writing:\n\n${insightText}\n\nSynthesize these into a structured profile.`,
      },
    ],
  });

  let resultText = "";
  for (const block of response.content) {
    if (block.type === "text") resultText += block.text;
  }

  try {
    const profile = JSON.parse(resultText);
    return Response.json(profile);
  } catch {
    return Response.json({ error: "Failed to parse profile" }, { status: 500 });
  }
}
