import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/mcp-auth";
import { createNote } from "@/lib/notes";
import { embedNote } from "@/lib/embeddings";

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await request.json();
  const { title, content } = body;

  if (!title || !content) {
    return Response.json(
      { error: "title and content are required" },
      { status: 400 }
    );
  }

  const note = await createNote(
    { title, content, type: "desktop" },
    auth.db
  );

  // Fire-and-forget: embed the note
  embedNote(note.id, title, content, auth.db).catch((err) =>
    console.error("[mcp:save-note] embedNote failed:", err)
  );

  // Fire-and-forget: trigger organize via internal fetch
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  fetch(`${baseUrl}/api/ai/organize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: request.headers.get("authorization") ?? "",
    },
    body: JSON.stringify({ noteId: note.id, recentSiblingIds: [] }),
  }).catch((err) =>
    console.error("[mcp:save-note] organize trigger failed:", err)
  );

  return Response.json({ noteId: note.id }, { status: 201 });
}
