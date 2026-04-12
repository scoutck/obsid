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
  `Save a note to the user's personal knowledge base (Obsid). This vault captures the user's thinking across ALL domains — work, relationships, hobbies, health, creative projects, decisions, observations about life.

CRITICAL: Do NOT produce a clean reference document or organized summary. Capture HOW the user thinks, not just WHAT was discussed. The vault's AI systems extract patterns from the user's thinking process — a polished summary destroys that signal.

When saving:
- Tell the story of what the user explored, in their voice
- Start with what sparked the conversation — what question or problem brought them here
- Follow the thread of their curiosity — how each question led to the next
- Quote the user's actual words at key moments: surprise ("what the fuck is that"), pushback ("i feel like that's wrong"), confusion ("why am i so confused"), realizations, decisions
- Capture wrong assumptions that got corrected — "I thought X, turns out Y because Z"
- Note when the user tested limits or made creative leaps — especially when they arrived at the right answer independently
- Separate what clicked from what was just context — not everything matters equally
- Preserve the user's learning/thinking style signals: did they ask for visuals? Push past surface explanations? Avoid formalism? Test ideas at their extremes?
- Include names of people mentioned naturally
- Do NOT reorganize the conversation into a textbook structure. The messy, honest progression is the point.
- Do NOT editorialize or add conclusions the user didn't reach`,
  {
    title: z.string().describe("Concise, natural title for the note"),
    content: z
      .string()
      .describe(
        "Markdown note — captures the user's thinking process, curiosity thread, and actual words, not a polished summary"
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
