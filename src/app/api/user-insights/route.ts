import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getUserInsights, createUserInsights } from "@/lib/user-insights";

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const insights = await getUserInsights(db);
  return Response.json(insights);
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const body = await request.json();

  if (!Array.isArray(body.insights)) {
    return Response.json({ error: "insights array required" }, { status: 400 });
  }

  const created = await createUserInsights(body.insights, db);
  return Response.json({ created: created.length });
}
