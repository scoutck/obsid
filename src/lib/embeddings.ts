import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function rankBySimilarity(
  query: Float32Array,
  items: Array<{ id: string; vector: Float32Array }>,
  limit: number
): Array<{ id: string; score: number }> {
  const scored = items.map((item) => ({
    id: item.id,
    score: cosineSimilarity(query, item.vector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export async function embedText(text: string): Promise<Float32Array> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");

  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: VOYAGE_MODEL,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return new Float32Array(data.data[0].embedding);
}

export async function embedNote(noteId: string, title: string, content: string, db: PrismaClient = defaultPrisma): Promise<void> {
  const text = `${title}\n${content}`.trim();
  if (!text) return;

  let vector: Float32Array;
  try {
    vector = await embedText(text);
  } catch (err) {
    console.error(`[embed] Failed to embed note ${noteId}:`, err);
    return;
  }

  const buffer = Buffer.from(vector.buffer.slice(0) as ArrayBuffer);

  const existing = await db.embedding.findUnique({ where: { noteId } });
  if (existing) {
    await db.embedding.update({
      where: { noteId },
      data: { vector: buffer, model: VOYAGE_MODEL },
    });
  } else {
    await db.embedding.create({
      data: { noteId, vector: buffer, model: VOYAGE_MODEL },
    });
  }
}

export async function semanticSearch(
  query: string,
  limit: number = 10,
  db: PrismaClient = defaultPrisma
): Promise<Array<{ noteId: string; score: number }>> {
  const queryVector = await embedText(query);

  const embeddings = await db.embedding.findMany();

  const items = embeddings.map((e) => ({
    id: e.noteId,
    vector: new Float32Array(
      e.vector.buffer,
      e.vector.byteOffset,
      e.vector.byteLength / 4
    ),
  }));

  return rankBySimilarity(queryVector, items, limit).map((r) => ({
    noteId: r.id,
    score: r.score,
  }));
}
