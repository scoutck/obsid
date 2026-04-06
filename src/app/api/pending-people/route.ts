import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { listPendingPeople, updatePendingPersonStatus } from "@/lib/pending-people";

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const pending = await listPendingPeople(db);
  return Response.json(pending);
}

export async function PUT(request: NextRequest) {
  const db = getDb(request);
  const { id, status } = await request.json();

  if (status !== "confirmed" && status !== "dismissed") {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  await updatePendingPersonStatus(id, status, db);
  return Response.json({ success: true });
}
