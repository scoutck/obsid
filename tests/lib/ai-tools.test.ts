import { describe, it, expect } from "vitest";
import { vaultTools, readOnlyVaultTools } from "@/lib/ai-tools";

describe("readOnlyVaultTools", () => {
  it("excludes write tools", () => {
    const names = readOnlyVaultTools.map((t) => t.name);
    expect(names).not.toContain("create_note");
    expect(names).not.toContain("update_note");
    expect(names).not.toContain("update_person");
    expect(names).not.toContain("create_pending_person");
  });

  it("includes read tools and new search tools", () => {
    const names = readOnlyVaultTools.map((t) => t.name);
    expect(names).toContain("semantic_search");
    expect(names).toContain("read_note");
    expect(names).toContain("list_people");
    expect(names).toContain("search_by_tags");
    expect(names).toContain("search_by_person");
    expect(names).toContain("get_note_graph");
    expect(names).toContain("search_by_timeframe");
  });

  it("has fewer tools than full vaultTools", () => {
    expect(readOnlyVaultTools.length).toBe(vaultTools.length - 4);
  });
});
