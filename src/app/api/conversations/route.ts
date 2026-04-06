import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createConversation, getMostRecentConversation } from "@/lib/conversations";

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const conversation = await getMostRecentConversation(db);
  return Response.json(conversation);
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const body = await request.json();
  const conversation = await createConversation(body.title ?? "", db);
  return Response.json(conversation, { status: 201 });
}
