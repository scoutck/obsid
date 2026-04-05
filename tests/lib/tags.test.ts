import { describe, it, expect, beforeEach } from "vitest";
import { extractInlineTags, getTagVocabulary } from "@/lib/tags";
import { createNote } from "@/lib/notes";
import { prisma } from "@/lib/db";

describe("extractInlineTags", () => {
  it("extracts simple tags", () => {
    const tags = extractInlineTags("Hello #meeting-notes and #project-atlas");
    expect(tags).toEqual(["meeting-notes", "project-atlas"]);
  });

  it("deduplicates tags", () => {
    const tags = extractInlineTags("#tag1 some text #tag1");
    expect(tags).toEqual(["tag1"]);
  });

  it("ignores headings", () => {
    const tags = extractInlineTags("# Heading\n\nSome #real-tag");
    expect(tags).toEqual(["real-tag"]);
  });

  it("ignores tags in code blocks", () => {
    const tags = extractInlineTags("```\n#not-a-tag\n```\n#real-tag");
    expect(tags).toEqual(["real-tag"]);
  });

  it("ignores tags in inline code", () => {
    const tags = extractInlineTags("Use `#not-a-tag` but #real-tag");
    expect(tags).toEqual(["real-tag"]);
  });

  it("handles tags with underscores", () => {
    const tags = extractInlineTags("#my_tag");
    expect(tags).toEqual(["my_tag"]);
  });

  it("does not match mid-word hash like C#", () => {
    const tags = extractInlineTags("I use C# daily");
    expect(tags).toEqual([]);
  });

  it("returns empty array for no tags", () => {
    const tags = extractInlineTags("No tags here");
    expect(tags).toEqual([]);
  });

  it("does not extract tags from lines without hash patterns", () => {
    const tags = extractInlineTags(
      "#real-tag\n/claude flag this\n\u2713 saved to note\n\u2717 failed"
    );
    expect(tags).toEqual(["real-tag"]);
  });
});

describe("getTagVocabulary", () => {
  beforeEach(async () => {
    await prisma.note.deleteMany();
  });

  it("returns tags with counts", async () => {
    await createNote({ tags: ["meeting", "project-atlas"] });
    await createNote({ tags: ["meeting", "q2"] });
    await createNote({ tags: ["project-atlas"] });

    const vocab = await getTagVocabulary();
    expect(vocab).toContainEqual({ tag: "meeting", count: 2 });
    expect(vocab).toContainEqual({ tag: "project-atlas", count: 2 });
    expect(vocab).toContainEqual({ tag: "q2", count: 1 });
  });

  it("returns empty array when no tags exist", async () => {
    await createNote({});
    const vocab = await getTagVocabulary();
    expect(vocab).toEqual([]);
  });

  it("sorts by count descending", async () => {
    await createNote({ tags: ["rare"] });
    await createNote({ tags: ["common"] });
    await createNote({ tags: ["common"] });
    await createNote({ tags: ["common"] });

    const vocab = await getTagVocabulary();
    expect(vocab[0].tag).toBe("common");
    expect(vocab[0].count).toBe(3);
  });
});
