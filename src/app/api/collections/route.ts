import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createCollection, listCollections } from "@/lib/collections";

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const collections = await listCollections(db);
  return NextResponse.json(collections);
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const body = await request.json();
  const collection = await createCollection(body, db);
  return NextResponse.json(collection, { status: 201 });
}
