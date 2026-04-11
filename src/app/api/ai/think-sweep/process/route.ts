import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { processThinkResult } from "@/lib/think-pipeline";
import type { ThinkResult } from "@/lib/think-synthesizer";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const cookie = request.headers.get("cookie") ?? "";
  const { batchId } = await request.json();

  if (!batchId) {
    return Response.json({ error: "batchId is required" }, { status: 400 });
  }

  const anthropic = new Anthropic();

  // Verify batch is complete
  const batch = await anthropic.beta.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") {
    return Response.json({ error: "Batch is not yet complete" }, { status: 400 });
  }

  // Get stored intermediate data
  const items = await db.thinkBatchItem.findMany({
    where: { batchId },
  });

  if (items.length === 0) {
    return Response.json({ error: "No batch items found" }, { status: 404 });
  }

  // Process batch results
  let processed = 0;
  let failed = 0;

  const batchResults = await anthropic.beta.messages.batches.results(batchId);
  for await (const result of batchResults) {
    const item = items.find((i) => i.customId === result.custom_id);
    if (!item) continue;

    if (result.result.type !== "succeeded") {
      console.error(`[think-sweep:process] Batch item ${result.custom_id} failed:`, result.result.type);
      failed++;
      continue;
    }

    const message = result.result.message;
    let resultText = "";
    for (const block of message.content) {
      if (block.type === "text") resultText += block.text;
    }

    resultText = resultText
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) resultText = jsonMatch[0];

    let thinkResult: ThinkResult;
    try {
      thinkResult = JSON.parse(resultText);
    } catch {
      console.warn(`[think-sweep:process] Non-JSON for ${result.custom_id}:`, resultText.slice(0, 200));
      failed++;
      continue;
    }

    try {
      await processThinkResult(item.noteId, thinkResult, db, cookie);
      processed++;
    } catch (err) {
      console.error(`[think-sweep:process] Failed to process ${result.custom_id}:`, err);
      failed++;
    }
  }

  // Clean up batch items
  await db.thinkBatchItem.deleteMany({ where: { batchId } });

  return Response.json({ processed, failed, total: items.length });
}
