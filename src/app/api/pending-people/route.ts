import { NextRequest } from "next/server";
import { listPendingPeople, updatePendingPersonStatus } from "@/lib/pending-people";

export async function GET() {
  const pending = await listPendingPeople();
  return Response.json(pending);
}

export async function PUT(request: NextRequest) {
  const { id, status } = await request.json();

  if (status !== "confirmed" && status !== "dismissed") {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  await updatePendingPersonStatus(id, status);
  return Response.json({ success: true });
}
