import { NextRequest } from "next/server";
import { createConversation, getMostRecentConversation } from "@/lib/conversations";

export async function GET() {
  const conversation = await getMostRecentConversation();
  return Response.json(conversation);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const conversation = await createConversation(body.title ?? "");
  return Response.json(conversation, { status: 201 });
}
