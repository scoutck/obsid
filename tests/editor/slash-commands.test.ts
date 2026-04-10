import { describe, it, expect } from "vitest";
import { slashCommands, filterCommands } from "@/editor/slash-commands";

describe("slashCommands", () => {
  it("contains all expected command categories", () => {
    const categories = [...new Set(slashCommands.map((c) => c.category))];
    expect(categories).toContain("Formatting");
    expect(categories).toContain("Notes");
    expect(categories).toContain("Organization");
    expect(categories).toContain("AI");
    expect(categories).toContain("Mode");
  });

  it("each command has label, category, and action", () => {
    for (const cmd of slashCommands) {
      expect(cmd.label).toBeTruthy();
      expect(cmd.category).toBeTruthy();
      expect(cmd.action).toBeDefined();
    }
  });

  it("each command has an icon field", () => {
    for (const cmd of slashCommands) {
      expect(cmd.icon).toBeTruthy();
    }
  });
});

describe("filterCommands", () => {
  it("returns all commands for empty query with no mode", () => {
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

  it("filters to notes-mode commands when mode is notes", () => {
    const results = filterCommands("", "notes");
    // notes mode excludes chat-only commands (Notes Mode, New Chat)
    expect(results.every((cmd) => !cmd.mode || cmd.mode === "notes")).toBe(true);
    // should include formatting
    expect(results.some((cmd) => cmd.category === "Formatting")).toBe(true);
    // should not include chat-only commands
    expect(results.some((cmd) => cmd.action === "mode:notes")).toBe(false);
    expect(results.some((cmd) => cmd.action === "mode:new-chat")).toBe(false);
  });

  it("filters to chat-mode commands when mode is chat", () => {
    const results = filterCommands("", "chat");
    // chat mode excludes notes-only commands (Formatting, etc.)
    expect(results.every((cmd) => !cmd.mode || cmd.mode === "chat")).toBe(true);
    // should not include formatting
    expect(results.some((cmd) => cmd.category === "Formatting")).toBe(false);
    // should include Notes Mode and New Chat
    expect(results.some((cmd) => cmd.action === "mode:notes")).toBe(true);
    expect(results.some((cmd) => cmd.action === "mode:new-chat")).toBe(true);
  });

  it("both modes include commands with no mode field", () => {
    const notesResults = filterCommands("", "notes");
    const chatResults = filterCommands("", "chat");
    // New Note, Open Note, Daily Note have no mode restriction
    expect(notesResults.some((cmd) => cmd.action === "note:new")).toBe(true);
    expect(chatResults.some((cmd) => cmd.action === "note:new")).toBe(true);
    // People, New Person, Pending People also have no mode restriction
    expect(notesResults.some((cmd) => cmd.action === "org:people")).toBe(true);
    expect(chatResults.some((cmd) => cmd.action === "org:people")).toBe(true);
  });
});
