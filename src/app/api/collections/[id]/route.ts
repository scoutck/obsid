import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCollection, deleteCollection } from "@/lib/collections";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  const collection = await getCollection(id, db);
  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  return NextResponse.json(collection);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  await deleteCollection(id, db);
  return NextResponse.json({ success: true });
}
