import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { extractTasksFromContent, syncNoteTasks } from "@/lib/task-sync";

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const body = await request.json();
  const { noteId, content } = body;

  if (!noteId || typeof content !== "string") {
    return NextResponse.json(
      { error: "noteId and content required" },
      { status: 400 }
    );
  }

  const contentTasks = extractTasksFromContent(content);
  const result = await syncNoteTasks(noteId, contentTasks, db);

  return NextResponse.json(result);
}
