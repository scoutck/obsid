import { NextRequest, NextResponse } from "next/server";
import { createCollection, listCollections } from "@/lib/collections";

export async function GET() {
  const collections = await listCollections();
  return NextResponse.json(collections);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const collection = await createCollection(body);
  return NextResponse.json(collection, { status: 201 });
}
