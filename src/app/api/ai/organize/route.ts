import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getNote, updateNote, getRecentNotes, listNotes } from "@/lib/notes";
import { getTagVocabulary, extractInlineTags } from "@/lib/tags";
import {
  listPeople,
  getPersonByAlias,
  createPerson,
  addNotePerson,
} from "@/lib/people";
import { extractWikiLinks } from "@/editor/wiki-links";

const anthropic = new Anthropic();

interface OrganizeResult {
  tags: string[];
  links: string[];
  people: Array<{ name: string; role?: string }>;
  unresolvedPeople: string[];
  tagCorrections?: Array<{ from: string; to: string }>;
}

export async function POST(request: NextRequest) {
  const { noteId, recentSiblingIds } = await request.json();

  // Fetch note and snapshot updatedAt for staleness detection
  const note = await getNote(noteId);
  if (!note) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  const snapshotUpdatedAt = note.updatedAt.getTime();
  const { title, content } = note;

  // Gather vault context
  const [tagVocab, allNotes, recentSiblings, people] = await Promise.all([
    getTagVocabulary(),
    listNotes(),
    getRecentNotes(recentSiblingIds ?? []),
    listPeople(),
  ]);

  const existingTags = extractInlineTags(content);
  const existingLinks = extractWikiLinks(content);

  const noteTitles = allNotes
    .slice(0, 100)
    .map((n) => `- ${n.title || "Untitled"}: ${n.content.slice(0, 100)}`)
    .join("\n");

  const topTags = tagVocab
    .slice(0, 50)
    .map((t) => `${t.tag} (${t.count})`)
    .join(", ");

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

## Existing tags in this note
${existingTags.length > 0 ? existingTags.map((t) => "#" + t).join(", ") : "(none)"}

## Existing links in this note
${existingLinks.length > 0 ? existingLinks.map((l) => "[[" + l + "]]").join(", ") : "(none)"}

## Tag vocabulary (top tags by frequency)
${topTags || "(no tags yet)"}

## Notes in vault
${noteTitles || "(no other notes)"}

## Recently edited notes (session context)
${siblingContext || "(none)"}

## Known people
${peopleList || "(none yet)"}

## Rules
- Return ONLY new tags not already in the note. Reuse existing vocabulary tags when appropriate.
- If you see a tag in the note that is a near-duplicate of a high-frequency tag (e.g., #meetings vs #meeting-notes), include it in tagCorrections.
- Only suggest links to notes that actually exist in the vault (match by title).
- For people: match names against known aliases (case-insensitive). Use first-mention convention — "Sarah C." disambiguates later bare "Sarah" in the same note.
- If a name is ambiguous (matches multiple people or no people and lacks disambiguation), put it in unresolvedPeople.
- For new people, include their name and role if detectable from context.
- Return valid JSON only, no markdown wrapping.`;

  const userPrompt = `Analyze this note and return JSON with new tags, links, people, and unresolved people.

Title: ${title}
Content:
${content}

Return JSON in this exact format:
{
  "tags": ["new-tag-1", "new-tag-2"],
  "links": ["Existing Note Title"],
  "people": [{"name": "Full Name", "role": "optional role"}],
  "unresolvedPeople": ["ambiguous name"],
  "tagCorrections": [{"from": "misspelled-tag", "to": "correct-tag"}]
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

  let result: OrganizeResult;
  try {
    result = JSON.parse(resultText);
  } catch {
    console.error("[organize] Failed to parse AI response:", resultText.slice(0, 200));
    return Response.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  // Use the original content from the request (not a re-fetch) to avoid
  // race conditions with auto-save modifying the note while AI was processing.
  let updatedContent = content;

  // Apply tag corrections in content
  if (result.tagCorrections) {
    for (const correction of result.tagCorrections) {
      // Escape regex special chars — correction.from comes from AI output
      const escaped = correction.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      updatedContent = updatedContent.replace(
        new RegExp(`#${escaped}(?=\\s|$)`, "g"),
        `#${correction.to}`
      );
    }
  }

  // Append new tags and links at bottom
  const newItems: string[] = [];
  if (result.tags.length > 0) {
    const tagsToAdd = result.tags.filter(
      (t) => !existingTags.includes(t)
    );
    if (tagsToAdd.length > 0) {
      newItems.push(tagsToAdd.map((t) => `#${t}`).join(" "));
    }
  }
  if (result.links.length > 0) {
    const linksToAdd = result.links.filter(
      (l) => !existingLinks.includes(l)
    );
    if (linksToAdd.length > 0) {
      newItems.push(linksToAdd.map((l) => `[[${l}]]`).join(" "));
    }
  }

  if (newItems.length > 0) {
    updatedContent = updatedContent.trimEnd() + "\n\n" + newItems.join(" ") + "\n";
  }

  // Process people
  const resolvedPeople: string[] = [];
  for (const person of result.people) {
    const existing = await getPersonByAlias(person.name);
    if (existing) {
      await addNotePerson(noteId, existing.note.id);
      resolvedPeople.push(existing.note.title);
    } else {
      const newPerson = await createPerson({
        name: person.name,
        role: person.role,
        content: `# ${person.name}\n\n${person.role ? `**Role:** ${person.role}\n\n` : ""}`,
      });
      await addNotePerson(noteId, newPerson.note.id);
      resolvedPeople.push(person.name);
    }
  }

  // Staleness check: if the note was modified while AI was processing, discard
  const currentNote = await getNote(noteId);
  if (!currentNote || currentNote.updatedAt.getTime() !== snapshotUpdatedAt) {
    return Response.json({ stale: true });
  }

  // Compute final tags from updated content
  const finalTags = extractInlineTags(updatedContent);

  await updateNote(noteId, {
    content: updatedContent,
    tags: finalTags,
    unresolvedPeople: result.unresolvedPeople,
  });

  return Response.json({
    tagsAdded: result.tags.filter((t) => !existingTags.includes(t)),
    linksAdded: result.links.filter((l) => !existingLinks.includes(l)),
    peopleResolved: resolvedPeople,
    unresolvedPeople: result.unresolvedPeople,
    tagCorrections: result.tagCorrections ?? [],
  });
}
