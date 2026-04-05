import { NextRequest, NextResponse } from "next/server";
import { getCollection, deleteCollection } from "@/lib/collections";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const collection = await getCollection(id);
  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  return NextResponse.json(collection);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteCollection(id);
  return NextResponse.json({ success: true });
}
