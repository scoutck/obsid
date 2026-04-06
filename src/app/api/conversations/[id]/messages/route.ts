import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getMessages } from "@/lib/conversations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const messages = await getMessages(id, limit, db);
  return Response.json(messages);
}
