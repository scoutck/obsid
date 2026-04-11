import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get("batchId");
  if (!batchId) {
    return Response.json({ error: "batchId is required" }, { status: 400 });
  }

  const anthropic = new Anthropic();

  try {
    const batch = await anthropic.beta.messages.batches.retrieve(batchId);
    return Response.json({
      batchId: batch.id,
      status: batch.processing_status,
      counts: batch.request_counts,
    });
  } catch (err) {
    console.error("[think-sweep:status] Failed to retrieve batch:", err);
    return Response.json({ error: "Failed to retrieve batch status" }, { status: 502 });
  }
}
