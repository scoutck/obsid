// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  createUserInsight,
  createUserInsights,
  getUserInsights,
  getUserInsightsByCategory,
  deleteUserInsight,
  getLastThinkAt,
} from "@/lib/user-insights";
import { createNote } from "@/lib/notes";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.userInsight.deleteMany();
  await prisma.note.deleteMany();
});

describe("createUserInsight", () => {
  it("creates an insight with all fields", async () => {
    const note = await createNote({ title: "Test note" });
    const insight = await createUserInsight({
      category: "behavior",
      content: "Procrastinates on presentations",
      evidence: "I always leave presentations to the last minute",
      sourceNoteId: note.id,
    });
    expect(insight.id).toBeDefined();
    expect(insight.category).toBe("behavior");
    expect(insight.content).toBe("Procrastinates on presentations");
    expect(insight.evidence).toBe("I always leave presentations to the last minute");
    expect(insight.sourceNoteId).toBe(note.id);
  });

  it("creates an insight without sourceNoteId", async () => {
    const insight = await createUserInsight({
      category: "expertise",
      content: "Deep knowledge of distributed systems",
    });
    expect(insight.sourceNoteId).toBeNull();
    expect(insight.evidence).toBe("");
  });
});

describe("createUserInsights", () => {
  it("batch creates multiple insights", async () => {
    const note = await createNote({ title: "Reflection" });
    const insights = await createUserInsights([
      { category: "behavior", content: "Night owl", sourceNoteId: note.id },
      { category: "expertise", content: "Knows TypeScript well", sourceNoteId: note.id },
    ]);
    expect(insights).toHaveLength(2);
    expect(insights[0].category).toBe("behavior");
    expect(insights[1].category).toBe("expertise");
  });

  it("returns empty array for empty input", async () => {
    const insights = await createUserInsights([]);
    expect(insights).toHaveLength(0);
  });
});

describe("getUserInsights", () => {
  it("returns all insights ordered by createdAt desc", async () => {
    await createUserInsight({ category: "behavior", content: "First" });
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    await createUserInsight({ category: "expertise", content: "Second" });

    const insights = await getUserInsights();
    expect(insights).toHaveLength(2);
    // Most recent first
    expect(insights[0].content).toBe("Second");
    expect(insights[1].content).toBe("First");
  });
});

describe("getUserInsightsByCategory", () => {
  it("filters by category", async () => {
    await createUserInsight({ category: "behavior", content: "Night owl" });
    await createUserInsight({ category: "expertise", content: "TypeScript" });
    await createUserInsight({ category: "behavior", content: "Procrastinator" });

    const behaviors = await getUserInsightsByCategory("behavior");
    expect(behaviors).toHaveLength(2);
    behaviors.forEach((b) => expect(b.category).toBe("behavior"));
  });
});

describe("deleteUserInsight", () => {
  it("removes the insight", async () => {
    const insight = await createUserInsight({ category: "behavior", content: "Test" });
    await deleteUserInsight(insight.id);
    const all = await getUserInsights();
    expect(all).toHaveLength(0);
  });
});

describe("createUserInsight relationship category", () => {
  beforeEach(async () => {
    await prisma.userInsight.deleteMany();
  });

  it("accepts relationship category", async () => {
    const insight = await createUserInsight({
      category: "relationship",
      content: "Values directness in close friendships",
      evidence: "I just told her exactly what I thought",
      source: "claude-desktop",
    });
    expect(insight.category).toBe("relationship");
    expect(insight.source).toBe("claude-desktop");
  });
});

describe("getLastThinkAt", () => {
  it("returns null when no think insights exist", async () => {
    const result = await getLastThinkAt();
    expect(result).toBeNull();
  });

  it("returns the most recent think insight createdAt", async () => {
    await createUserInsight({ category: "behavior", content: "organize insight", source: "organize" });
    await createUserInsight({ category: "behavior", content: "think insight", source: "think" });

    const result = await getLastThinkAt();
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Date);
  });
});
