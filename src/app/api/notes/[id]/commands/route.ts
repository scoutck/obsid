import { NextRequest, NextResponse } from "next/server";
import { getCommandsForNote } from "@/lib/commands";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const commands = await getCommandsForNote(id);
  return NextResponse.json(commands);
}
