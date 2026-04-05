/**
 * Extract inline #tag patterns from markdown content.
 *
 * Ignores tags inside code blocks, inline code, heading lines,
 * /claude command lines, and confirmation lines (✓/✗).
 * Skips mid-word hashes (e.g. C#).
 * Tags must start with a letter and can contain alphanumeric, hyphens, underscores.
 * Returns a deduplicated array.
 *
 * This is a pure function (no DB access) — safe to import in client components.
 */
export function extractInlineTags(content: string): string[] {
  // Remove fenced code blocks
  let cleaned = content.replace(/```[\s\S]*?```/g, "");

  // Remove inline code
  cleaned = cleaned.replace(/`[^`]+`/g, "");

  // Process line by line
  const lines = cleaned.split("\n");
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Skip heading lines (# followed by space)
    if (/^#{1,6}\s/.test(trimmed)) continue;

    // Skip /claude command lines
    if (trimmed.startsWith("/claude")) continue;

    // Skip confirmation lines (✓ or ✗)
    if (trimmed.startsWith("\u2713") || trimmed.startsWith("\u2717")) continue;

    // Match #tag at start of line or after whitespace
    // Tag must start with a letter, can contain alphanumeric, hyphens, underscores
    const matches = line.matchAll(/(?:^|(?<=\s))#([a-zA-Z][a-zA-Z0-9_-]*)/g);
    for (const match of matches) {
      const tag = match[1];
      if (!seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    }
  }

  return tags;
}
