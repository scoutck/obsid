import { describe, it, expect } from "vitest";
import { applyFormatting } from "@/editor/formatting";

describe("applyFormatting", () => {
  it("wraps selected text with bold markers", () => {
    const result = applyFormatting("format:bold", "hello", true);
    expect(result).toEqual({ text: "**hello**", cursorOffset: 0 });
  });

  it("inserts bold markers with no selection", () => {
    const result = applyFormatting("format:bold", "", false);
    expect(result).toEqual({ text: "****", cursorOffset: -2 });
  });

  it("wraps with italic", () => {
    const result = applyFormatting("format:italic", "hello", true);
    expect(result).toEqual({ text: "*hello*", cursorOffset: 0 });
  });

  it("wraps with strikethrough", () => {
    const result = applyFormatting("format:strikethrough", "hello", true);
    expect(result).toEqual({ text: "~~hello~~", cursorOffset: 0 });
  });

  it("wraps with highlight", () => {
    const result = applyFormatting("format:highlight", "hello", true);
    expect(result).toEqual({ text: "==hello==", cursorOffset: 0 });
  });

  it("inserts heading 1 at line start", () => {
    const result = applyFormatting("format:h1", "", false);
    expect(result).toEqual({ text: "# ", cursorOffset: 0 });
  });

  it("inserts heading 2 at line start", () => {
    const result = applyFormatting("format:h2", "", false);
    expect(result).toEqual({ text: "## ", cursorOffset: 0 });
  });

  it("inserts bullet list", () => {
    const result = applyFormatting("format:bullet", "", false);
    expect(result).toEqual({ text: "- ", cursorOffset: 0 });
  });

  it("inserts numbered list", () => {
    const result = applyFormatting("format:number", "", false);
    expect(result).toEqual({ text: "1. ", cursorOffset: 0 });
  });

  it("inserts divider", () => {
    const result = applyFormatting("format:divider", "", false);
    expect(result).toEqual({ text: "\n---\n", cursorOffset: 0 });
  });
});
