import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.OBSID_API_URL ?? "http://localhost:3000";
const API_KEY = process.env.OBSID_API_KEY ?? "";

if (!API_KEY) {
  console.error("OBSID_API_KEY environment variable is required");
  process.exit(1);
}

const server = new McpServer({
  name: "obsid",
  version: "1.0.0",
});

server.tool(
  "save_to_vault",
  `Save a distilled note to the user's personal knowledge base (Obsid). This vault captures the user's thinking across ALL domains — work, relationships, hobbies, health, creative projects, decisions, observations about life.

When saving:
- Write in the user's voice, not as a conversation summary
- Preserve the user's actual words and phrases as much as possible — quote them naturally within the note
- Distill structure (what was discussed, what was decided, what's unresolved) but keep the user's language as the substance
- Don't editorialize or add conclusions the user didn't reach
- Include names of people mentioned naturally`,
  {
    title: z.string().describe("Concise, natural title for the note"),
    content: z
      .string()
      .describe(
        "Markdown note content — distilled with structure but preserving the user's words"
      ),
  },
  async ({ title, content }) => {
    const res = await fetch(`${API_URL}/api/mcp/save-note`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ title, content }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<
        string,
        string
      >;
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to save note: ${err.error ?? res.statusText}`,
          },
        ],
        isError: true,
      };
    }

    const data = (await res.json()) as { noteId: string };
    return {
      content: [
        {
          type: "text" as const,
          text: `Note saved to vault (id: ${data.noteId}). It will be automatically organized, embedded, and linked.`,
        },
      ],
    };
  }
);

server.tool(
  "capture_insight",
  `Capture an observation about the user into their knowledge base. Use when you notice patterns in how the user thinks, acts, decides, or relates to people — across any domain of life, not just work.

IMPORTANT: Always ask the user for permission before calling this tool. Frame what you noticed and let them decide.

Categories:
- behavior: how they act or respond in situations
- self-reflection: something they realized about themselves
- expertise: knowledge or skill they demonstrated
- thinking-pattern: how they reason or approach problems
- relationship: how they relate to or think about specific people`,
  {
    category: z
      .enum([
        "behavior",
        "self-reflection",
        "expertise",
        "thinking-pattern",
        "relationship",
      ])
      .describe("Insight category"),
    content: z.string().describe("The insight, written about the user"),
    evidence: z
      .string()
      .describe(
        "The user's own words or context that supports this"
      ),
    personName: z
      .string()
      .optional()
      .describe("If the insight involves a specific person"),
    relatedTopics: z
      .array(z.string())
      .optional()
      .describe("Free-text topic hints for future linking"),
  },
  async ({ category, content, evidence, personName, relatedTopics }) => {
    const res = await fetch(`${API_URL}/api/mcp/save-insight`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        category,
        content,
        evidence,
        personName,
        relatedTopics,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<
        string,
        string
      >;
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to capture insight: ${err.error ?? res.statusText}`,
          },
        ],
        isError: true,
      };
    }

    const data = (await res.json()) as { insightId: string };
    return {
      content: [
        {
          type: "text" as const,
          text: `Insight captured (id: ${data.insightId}).`,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
