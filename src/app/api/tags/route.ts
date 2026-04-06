import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getTagVocabulary } from "@/lib/tags";

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const vocabulary = await getTagVocabulary(db);
  return Response.json(vocabulary);
}
