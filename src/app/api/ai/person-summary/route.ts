import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getPerson, getNotesMentioning, updatePersonSummary } from "@/lib/people";

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  const { personNoteId } = await request.json();

  const person = await getPerson(personNoteId);
  if (!person) {
    return Response.json({ error: "Person not found" }, { status: 404 });
  }

  const connectedNotes = await getNotesMentioning(personNoteId);

  const noteContext = connectedNotes
    .map((n) => `### ${n.title}\n${n.content.slice(0, 500)}`)
    .join("\n\n");

  const currentSummary = person.meta.summary;
  const userContext = person.meta.userContext;

  const systemPrompt = `You write concise relationship summaries for a personal knowledge base. Given a person's details and notes that mention them, write a 2-4 sentence summary covering: who they are, how the user interacts with them, and what they care about.

Write in second person ("you" = the knowledge base owner). Be specific and practical, not generic.

${currentSummary ? `The current summary is:\n${currentSummary}\n\nUpdate it to incorporate new information. Preserve the tone and any details the user may have edited in.` : ""}
${userContext ? `\nUser-provided context about this person:\n${userContext}` : ""}`;

  const userPrompt = `Person: ${person.note.title}
Role: ${person.meta.role || "unknown"}
Aliases: ${person.meta.aliases.join(", ")}

Connected notes (${connectedNotes.length}):
${noteContext || "(no connected notes yet)"}

Write the relationship summary.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    let summary = "";
    for (const block of response.content) {
      if (block.type === "text") summary += block.text;
    }

    await updatePersonSummary(personNoteId, summary.trim());

    return Response.json({ success: true });
  } catch (err) {
    console.error("[person-summary] AI request failed:", err);
    return Response.json({ error: "AI request failed" }, { status: 502 });
  }
}
