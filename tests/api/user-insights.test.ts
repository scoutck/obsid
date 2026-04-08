// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/user-insights/route";
import { createUserInsight } from "@/lib/user-insights";
import { createNote } from "@/lib/notes";
import { prisma } from "@/lib/db";

function makeRequest(body?: unknown): Request {
  if (body) {
    return new Request("http://localhost/api/user-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return new Request("http://localhost/api/user-insights");
}

beforeEach(async () => {
  await prisma.userInsight.deleteMany();
  await prisma.note.deleteMany();
});

describe("GET /api/user-insights", () => {
  it("returns all insights", async () => {
    await createUserInsight({ category: "behavior", content: "Night owl" });
    await createUserInsight({ category: "expertise", content: "TypeScript" });

    const res = await GET(makeRequest() as never);
    const data = await res.json();
    expect(data).toHaveLength(2);
  });

  it("returns empty array when no insights", async () => {
    const res = await GET(makeRequest() as never);
    const data = await res.json();
    expect(data).toHaveLength(0);
  });
});

describe("POST /api/user-insights", () => {
  it("creates insights from array", async () => {
    const note = await createNote({ title: "Test" });
    const res = await POST(makeRequest({
      insights: [
        { category: "behavior", content: "Night owl", evidence: "I work best at 2am", sourceNoteId: note.id },
        { category: "expertise", content: "TypeScript expert" },
      ],
    }) as never);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.created).toBe(2);
  });

  it("returns 400 for missing insights array", async () => {
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(400);
  });
});
