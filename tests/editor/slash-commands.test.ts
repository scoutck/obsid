import { describe, it, expect } from "vitest";
import { slashCommands, filterCommands } from "@/editor/slash-commands";

describe("slashCommands", () => {
  it("contains all expected command categories", () => {
    const categories = [...new Set(slashCommands.map((c) => c.category))];
    expect(categories).toContain("Formatting");
    expect(categories).toContain("Notes");
    expect(categories).toContain("Organization");
    expect(categories).toContain("AI");
  });

  it("each command has label, category, and action", () => {
    for (const cmd of slashCommands) {
      expect(cmd.label).toBeTruthy();
      expect(cmd.category).toBeTruthy();
      expect(cmd.action).toBeDefined();
    }
  });
});

describe("filterCommands", () => {
  it("returns all commands for empty query", () => {
    const results = filterCommands("");
    expect(results).toHaveLength(slashCommands.length);
  });

  it("filters by label", () => {
    const results = filterCommands("bold");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].label.toLowerCase()).toContain("bold");
  });

  it("is case insensitive", () => {
    const results = filterCommands("HEADING");
    expect(results.length).toBeGreaterThan(0);
  });
});
