import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { getNote, conditionalUpdateNote, getRecentNotes, listContextNotes } from "@/lib/notes";
import { extractInlineTags } from "@/lib/tags";
import {
  listPeople,
  getPersonsByAliases,
  addNotePeople,
} from "@/lib/people";
import { createPendingPerson } from "@/lib/pending-people";
import { createUserInsights } from "@/lib/user-insights";
import { embedNote } from "@/lib/embeddings";
import { extractWikiLinks } from "@/editor/wiki-links";

const anthropic = new Anthropic();

interface OrganizeResult {
  links: string[];
  people: Array<{ name: string; role?: string }>;
  unresolvedPeople: string[];
  userInsights?: Array<{ category: string; content: string; evidence?: string }>;
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const { noteId, recentSiblingIds } = await request.json();

  // Fetch note and snapshot updatedAt for staleness detection
  const note = await getNote(noteId, db);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  const snapshotUpdatedAt = note.updatedAt.getTime();
  const { title, content } = note;

  // Gather vault context
  const [recentSiblings, people] = await Promise.all([
    getRecentNotes(recentSiblingIds ?? [], db),
    listPeople(db),
  ]);

  const existingLinks = extractWikiLinks(content);

  // Context: 100 most recently edited notes, excluding this note and person notes.
  // Filtered and limited at SQL level for efficiency.
  const personNoteIds = people.map((p) => p.meta.noteId);
  const contextNotes = await listContextNotes(noteId, personNoteIds, 100, db);

  const noteTitles = contextNotes
    .map((n) => `- ${n.title || "Untitled"}: ${n.content.slice(0, 100)}`)
    .join("\n");

  const siblingContext = recentSiblings
    .map((n) => `### ${n.title}\n${n.content.slice(0, 300)}`)
    .join("\n\n");

  const peopleList = people
    .map(
      (p) =>
        `- ${p.note.title} (aliases: ${p.meta.aliases.join(", ")}${p.meta.role ? `, role: ${p.meta.role}` : ""})`
    )
    .join("\n");

  const systemPrompt = `You are an AI that organizes notes in a personal knowledge base. Analyze the note and return structured JSON.

## Existing links in this note
${existingLinks.length > 0 ? existingLinks.map((l) => "[[" + l + "]]").join(", ") : "(none)"}

## Notes in vault
${noteTitles || "(no other notes)"}

## Recently edited notes (session context)
${siblingContext || "(none)"}

## Known people
${peopleList || "(none yet)"}

## Rules
- Only suggest links to notes that actually exist in the vault (match by title).
- For people: match names in the note against known aliases (case-insensitive). In the "people" array, use the person's primary name exactly as listed in "Known people" above (the name before the parentheses), NOT the name variant found in the note text.
- If a name is ambiguous or doesn't match any known person, put it in unresolvedPeople.
- Return valid JSON only, no markdown wrapping.
- Also scan for self-reflective statements — moments where the author reveals something about themselves: habits, struggles, preferences, expertise, how they think or work. NOT task items ("finish the report") but self-revealing statements ("I always leave reports to the last minute"). Return these as userInsights with category being one of: "self-reflection", "expertise", "behavior", "thinking-pattern".`;

  const userPrompt = `Analyze this note and return JSON with links, people, and unresolved people.

Title: ${title}
Content:
${content}

Return JSON in this exact format:
{
  "links": ["Existing Note Title"],
  "people": [{"name": "Full Name", "role": "optional role"}],
  "unresolvedPeople": ["new or ambiguous name"],
  "userInsights": [{"category": "behavior", "content": "insight text", "evidence": "quote from note"}]
}`;

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    console.error("[organize] AI request failed:", err);
    return Response.json({ error: "AI request failed" }, { status: 502 });
  }

  let resultText = "";
  for (const block of response.content) {
    if (block.type === "text") resultText += block.text;
  }

  // Strip markdown code fences if present (AI sometimes wraps JSON in ```json ... ```)
  resultText = resultText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  let result: OrganizeResult;
  try {
    result = JSON.parse(resultText);
  } catch {
    console.error("[organize] Failed to parse AI response:", resultText.slice(0, 200));
    return Response.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  // Generate semantic summary via Haiku (fast, cheap)
  let summary = "";
  if (content.trim().length > 50) {
    try {
      const summaryResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Analyze this note and extract its underlying themes, tensions, and meaning in 2-3 sentences. Not a synopsis — what is this note REALLY about? What emotions, questions, or patterns are present beneath the surface?

Title: ${title}
Content:
${content}

Return only the summary text, nothing else.`,
          },
        ],
      });
      for (const block of summaryResponse.content) {
        if (block.type === "text") summary += block.text;
      }
      summary = summary.trim();
    } catch (err) {
      console.error("[organize] Summary generation failed:", err);
      // Non-fatal — continue without summary
    }
  }

  // Use the original content from the request (not a re-fetch) to avoid
  // race conditions with auto-save modifying the note while AI was processing.
  let updatedContent = content;

  // Append new links at bottom
  if (result.links.length > 0) {
    const linksToAdd = result.links.filter(
      (l) => !existingLinks.includes(l)
    );
    if (linksToAdd.length > 0) {
      updatedContent = updatedContent.trimEnd() + "\n\n" + linksToAdd.map((l) => `[[${l}]]`).join(" ") + "\n";
    }
  }

  // Batch resolve all people aliases at once (single DB load)
  const allAliases = result.people.map((p) => p.name);
  const aliasResults = await getPersonsByAliases(allAliases, db);

  // Collect resolved person note IDs for batch link creation
  const resolvedPeople: string[] = [];
  const resolvedPersonNoteIds: string[] = [];
  for (const person of result.people) {
    const existing = aliasResults.get(person.name);
    if (existing) {
      resolvedPeople.push(existing.note.title);
      resolvedPersonNoteIds.push(existing.note.id);
    }
  }

  // Compute final tags from updated content
  const finalTags = extractInlineTags(updatedContent);

  // Atomic conditional update: only writes if updatedAt hasn't changed.
  // All side effects (people links, pending people, insights) are deferred
  // until after the update succeeds to avoid orphaned data on stale writes.
  const updated = await conditionalUpdateNote(
    noteId,
    new Date(snapshotUpdatedAt),
    {
      content: updatedContent,
      tags: finalTags,
      summary,
    },
    db
  );

  if (!updated) {
    return Response.json({ stale: true });
  }

  // --- Side effects: only run after successful content update ---

  // Batch create all note-person links
  await addNotePeople(noteId, resolvedPersonNoteIds, db);

  // Process unresolved people: create PendingPerson entries
  const pendingPeople: string[] = [];
  for (const name of result.unresolvedPeople ?? []) {
    await createPendingPerson({ name, sourceNoteId: noteId, context: content.slice(0, 200) }, db);
    pendingPeople.push(name);
  }

  // Store user insights from AI analysis
  let insightsAdded = 0;
  if (result.userInsights && result.userInsights.length > 0) {
    const created = await createUserInsights(
      result.userInsights.map((i) => ({
        category: i.category,
        content: i.content,
        evidence: i.evidence ?? "",
        sourceNoteId: noteId,
      })),
      db
    );
    insightsAdded = created.length;
  }

  // Fire-and-forget embedding trigger
  embedNote(noteId, title, updatedContent, db, summary).catch((err) =>
    console.error("[organize] embedNote failed:", err)
  );

  // Fire-and-forget person summary regeneration for newly linked people
  for (const personNoteId of resolvedPersonNoteIds) {
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/ai/person-summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ personNoteId }),
    }).catch(() => {});
  }

  return Response.json({
    linksAdded: result.links.filter((l) => !existingLinks.includes(l)),
    peopleResolved: resolvedPeople,
    pendingPeople,
    insightsAdded,
  });
}
