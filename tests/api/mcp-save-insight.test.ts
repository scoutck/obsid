// @vitest-environment node
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/mcp/save-insight/route";

describe("POST /api/mcp/save-insight", () => {
  it("returns 401 without auth header", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "behavior",
        content: "Test insight",
        evidence: "Said something",
      }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });
});
