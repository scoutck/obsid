import { describe, it, expect } from "vitest";
import { cosineSimilarity, rankBySimilarity } from "@/lib/embeddings";

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
