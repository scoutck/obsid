// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { cosineSimilarity, rankBySimilarity } from "@/lib/embeddings";
import { prisma } from "@/lib/db";
import { createNote } from "@/lib/notes";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it("returns -1 for opposite vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });
});

describe("rankBySimilarity", () => {
  it("ranks items by cosine similarity descending", () => {
    const query = new Float32Array([1, 0, 0]);
    const items = [
      { id: "a", vector: new Float32Array([0, 1, 0]) },
      { id: "b", vector: new Float32Array([0.9, 0.1, 0]) },
      { id: "c", vector: new Float32Array([1, 0, 0]) },
    ];

    const ranked = rankBySimilarity(query, items, 3);
    expect(ranked.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(ranked[0].score).toBeCloseTo(1.0);
  });

  it("respects the limit parameter", () => {
    const query = new Float32Array([1, 0, 0]);
    const items = [
      { id: "a", vector: new Float32Array([0, 1, 0]) },
      { id: "b", vector: new Float32Array([0.9, 0.1, 0]) },
      { id: "c", vector: new Float32Array([1, 0, 0]) },
    ];

    const ranked = rankBySimilarity(query, items, 2);
    expect(ranked).toHaveLength(2);
  });
});

describe("embedding storage (DB-level)", () => {
  beforeEach(async () => {
    await prisma.embedding.deleteMany();
    await prisma.notePerson.deleteMany();
    await prisma.personMeta.deleteMany();
    await prisma.note.deleteMany();
  });

  it("stores and retrieves an embedding vector", async () => {
    const note = await createNote({ title: "Test" });
    const vector = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const buffer = Buffer.from(vector.buffer.slice(0) as ArrayBuffer);

    await prisma.embedding.create({
      data: { noteId: note.id, vector: buffer, model: "test" },
    });

    const stored = await prisma.embedding.findUnique({
      where: { noteId: note.id },
    });
    expect(stored).not.toBeNull();
    const retrieved = new Float32Array(new Uint8Array(stored!.vector).buffer);
    expect(retrieved[0]).toBeCloseTo(0.1);
    expect(retrieved[3]).toBeCloseTo(0.4);
  });

  it("overwrites embedding on update", async () => {
    const note = await createNote({ title: "Test" });
    const v1 = Buffer.from(new Float32Array([1, 0, 0, 0]).buffer.slice(0) as ArrayBuffer);
    const v2 = Buffer.from(new Float32Array([0, 1, 0, 0]).buffer.slice(0) as ArrayBuffer);

    await prisma.embedding.create({ data: { noteId: note.id, vector: v1, model: "test" } });
    await prisma.embedding.update({
      where: { noteId: note.id },
      data: { vector: v2 },
    });

    const stored = await prisma.embedding.findUnique({ where: { noteId: note.id } });
    const retrieved = new Float32Array(new Uint8Array(stored!.vector).buffer);
    expect(retrieved[0]).toBeCloseTo(0);
    expect(retrieved[1]).toBeCloseTo(1);
  });

  it("deletes embedding when note is deleted", async () => {
    const note = await createNote({ title: "Test" });
    const vector = Buffer.from(new Float32Array([1, 2, 3, 4]).buffer.slice(0) as ArrayBuffer);
    await prisma.embedding.create({ data: { noteId: note.id, vector, model: "test" } });

    await prisma.embedding.deleteMany({ where: { noteId: note.id } });
    const result = await prisma.embedding.findUnique({ where: { noteId: note.id } });
    expect(result).toBeNull();
  });
});
