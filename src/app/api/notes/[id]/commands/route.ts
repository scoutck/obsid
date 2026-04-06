import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCommandsForNote } from "@/lib/commands";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  const commands = await getCommandsForNote(id, db);
  return NextResponse.json(commands);
}
