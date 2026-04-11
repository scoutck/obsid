// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/mcp/save-note/route";

describe("POST /api/mcp/save-note", () => {
  beforeEach(async () => {
    await prisma.notePerson.deleteMany();
    await prisma.personMeta.deleteMany();
    await prisma.pendingPerson.deleteMany();
    await prisma.command.deleteMany();
    await prisma.embedding.deleteMany();
    await prisma.userInsight.deleteMany();
    await prisma.note.deleteMany();
  });

  it("returns 401 without auth header", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", content: "Hello" }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });

  it("returns 401 for invalid key", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer obsid_test",
      },
      body: JSON.stringify({ content: "Hello" }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });
});
