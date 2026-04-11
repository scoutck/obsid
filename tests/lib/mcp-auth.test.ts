// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateApiKey } from "@/lib/mcp-auth";

describe("validateApiKey", () => {
  it("returns null for missing Authorization header", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
    });
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });

  it("returns null for malformed Authorization header", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
      headers: { Authorization: "Basic abc123" },
    });
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });

  it("returns null for invalid key", async () => {
    const request = new Request("http://localhost:3000/api/mcp/save-note", {
      method: "POST",
      headers: { Authorization: "Bearer obsid_nonexistent" },
    });
    const result = await validateApiKey(request);
    expect(result).toBeNull();
  });
});
