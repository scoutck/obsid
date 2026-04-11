# Claude Desktop MCP Integration — Design Spec

## Overview

Connect Claude Desktop to Obsid via MCP so that conversations can be distilled into notes and insights in real-time. Claude Desktop does the distillation while it still has full conversational context, then pushes the result to Obsid's existing pipelines.

Write-only v1 — Claude Desktop can push to the vault but cannot read from it.

## Motivation

The user has extensive, wide-ranging Claude Desktop conversations across all life domains — work, relationships, hobbies, health, decisions. This content is currently ephemeral. Capturing it into Obsid means:

- The think system gets dramatically more material to find cross-vault connections
- The user profile builds from real-time behavioral observations, not just post-hoc note analysis
- People mentioned in conversations get tracked without manual note-writing
- Patterns across conversations surface that the user would never notice

## Architecture

```
Claude Desktop
    | stdio (MCP protocol)
    v
Local MCP Server (mcp/ directory)
    | HTTPS + API key
    v
Railway API (/api/mcp/* routes)
    | API key -> user lookup -> Turso DB
    v
Existing pipelines (organize, embed, person detect)
```

Three new pieces:
1. API key system in the admin database
2. Two new API routes under `/api/mcp/`
3. Local MCP server in `mcp/` — thin bridge, ~80 lines

## Capture Triggers

Two modes, matching the user's preference:

- **Explicit (user-initiated):** User says "save this to Obsid" or similar. Claude distills the conversation into a note and calls `save_to_vault`.
- **Proactive (Claude-initiated):** Claude notices a pattern, self-reflection, or behavioral signal. It asks permission ("I noticed something — want me to save this to your vault?") and on confirmation calls `capture_insight`.

Explicit saves produce full notes. Proactive captures produce raw insights (UserInsight entries). Different triggers, different outputs.

## MCP Tool Definitions

### `save_to_vault`

For explicit saves. Creates a full note in the vault.

```typescript
{
  name: "save_to_vault",
  description: `Save a distilled note to the user's personal knowledge base (Obsid).
    This vault captures the user's thinking across ALL domains — work, relationships,
    hobbies, health, creative projects, decisions, observations about life.

    When saving:
    - Write in the user's voice, not as a conversation summary
    - Preserve the user's actual words and phrases as much as possible —
      quote them naturally within the note
    - Distill structure (what was discussed, what was decided, what's unresolved)
      but keep the user's language as the substance
    - Don't editorialize or add conclusions the user didn't reach
    - Include names of people mentioned naturally`,
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Concise, natural title for the note" },
      content: { type: "string", description: "Markdown note content — distilled with structure but preserving the user's words" }
    },
    required: ["title", "content"]
  }
}
```

No `tags` field — tags are user-owned. The organize pipeline handles linking and tagging after the note is created.

### `capture_insight`

For proactive captures. Writes a UserInsight entry directly.

```typescript
{
  name: "capture_insight",
  description: `Capture an observation about the user into their knowledge base.
    Use when you notice patterns in how the user thinks, acts, decides, or relates
    to people — across any domain of life, not just work.

    IMPORTANT: Always ask the user for permission before calling this tool.
    Frame what you noticed and let them decide.

    Categories:
    - behavior: how they act or respond in situations
    - self-reflection: something they realized about themselves
    - expertise: knowledge or skill they demonstrated
    - thinking-pattern: how they reason or approach problems
    - relationship: how they relate to or think about specific people`,
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", enum: ["behavior", "self-reflection", "expertise", "thinking-pattern", "relationship"] },
      content: { type: "string", description: "The insight, written about the user" },
      evidence: { type: "string", description: "The user's own words or context that supports this" },
      personName: { type: "string", description: "If the insight involves a specific person" },
      relatedTopics: {
        type: "array",
        items: { type: "string" },
        description: "Free-text topic hints for future linking (e.g. 'career uncertainty', 'parenting')"
      }
    },
    required: ["category", "content", "evidence"]
  }
}
```

`relationship` is a new insight category not in the current system.

## Data Model Changes

### Admin Database

New `ApiKey` table in `admin-schema.prisma`:

```prisma
model ApiKey {
  id         String    @id @default(cuid())
  key        String    @unique
  userId     String
  name       String    @default("")
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
}
```

Key format: `obsid_` prefix + 32 random bytes hex-encoded.

### Per-User Database

**Note type:** Add `"desktop"` as a third note type (alongside `"note"` and `"person"`). The `save-note` route sets `type: "desktop"` automatically. Desktop notes flow through all existing pipelines identically to regular notes.

**Visual treatment:** Desktop notes get a visual indicator in the UI to distinguish provenance. Design deferred to `/frontend-design` during implementation.

**UserInsight source:** Add `"claude-desktop"` as a new source value (alongside `"think"` and `"organize"`). The profile synthesis prompt needs a one-line addition to handle this source.

**Insight category:** Add `"relationship"` to the set of valid categories. Profile synthesis prompt updated to incorporate relationship insights.

## API Routes

### Auth Helper: `src/lib/mcp-auth.ts`

```typescript
async function validateApiKey(request: NextRequest): Promise<{
  userId: string;
  db: PrismaClient;
} | null>
```

- Reads `Authorization: Bearer obsid_...` header
- Looks up key in admin DB
- Returns user's Turso credentials, creates per-user Prisma client
- Updates `lastUsedAt`
- Returns null on invalid key (route returns 401)

Bypasses the proxy/JWT flow — MCP requests don't carry cookies.

### `POST /api/mcp/save-note`

```
Headers: Authorization: Bearer obsid_...
Body: { title: string, content: string }

1. validateApiKey -> get user DB
2. createNote({ title, content, type: "desktop" }, db)
3. Fire-and-forget: organize, embed, generate summary
4. Return { noteId }
```

Same post-save pipeline as editor auto-save. The note enters through a different door but follows the same path.

### `POST /api/mcp/save-insight`

```
Headers: Authorization: Bearer obsid_...
Body: { category, content, evidence, personName?, relatedTopics? }

1. validateApiKey -> get user DB
2. createUserInsight({ category, content, evidence, source: "claude-desktop" }, db)
3. If personName: resolve via getPersonByAlias
   - Found: create NotePerson link, fire-and-forget person summary regen
   - Not found: create PendingPerson entry
4. Return { insightId }
```

`relatedTopics` concatenated into the `evidence` field as a comma-separated suffix (e.g. `"[Topics: career uncertainty, parenting]"`). No schema change needed — organize can parse these hints for wiki-linking later. If topic linking proves valuable, a dedicated field can be added in a future iteration.

## Local MCP Server

### Structure

```
mcp/
  package.json          # deps: @modelcontextprotocol/sdk
  tsconfig.json
  src/
    index.ts            # stdio transport, server setup
    tools.ts            # tool definitions + HTTP handlers
  INSTRUCTIONS.md       # system prompt guidance for Claude Desktop
```

### Behavior

- Spawned by Claude Desktop as a child process via stdio
- Reads `OBSID_API_URL` and `OBSID_API_KEY` from environment
- Each tool handler makes a `fetch()` to the corresponding `/api/mcp/*` route
- Returns success/failure to Claude Desktop
- No business logic — all logic lives server-side

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "obsid": {
      "command": "node",
      "args": ["/path/to/obsid/mcp/dist/index.js"],
      "env": {
        "OBSID_API_URL": "https://your-railway-url.com",
        "OBSID_API_KEY": "obsid_abc123..."
      }
    }
  }
}
```

### INSTRUCTIONS.md

Version-controlled prompt guidance included in the MCP server config. Key points:

- This vault captures the user's life across all domains, not just work
- `save_to_vault`: distill with structure but preserve the user's actual words. Include direct quotes woven naturally into the note.
- `capture_insight`: ask permission first. Look for patterns across all domains — decisions, relationships, habits, how they approach problems.
- Quality over quantity. Don't save routine exchanges.
- Don't editorialize or add conclusions the user didn't reach.

## Pipeline Integration

### Desktop notes flow through existing pipelines unchanged

1. **Embed** — vector generated from title + content
2. **Organize** — wiki-links, person detection, PendingPerson entries, UserInsight extraction
3. **Summary** — semantic summary for enriched search
4. **Think** — picked up by next vault-wide sweep (updatedAt > lastThinkAt)

Think does NOT run on save. It runs when the user triggers a sweep from `/me`. Desktop notes accumulate and are part of the corpus when think runs — connections between Desktop content and editor content is where the highest value lives.

### Desktop insights integrate with existing profile system

- Show up on `/me` alongside think and organize insights
- Aggregated into structured user profile by the synthesis endpoint
- `source: "claude-desktop"` distinguishes provenance
- Profile synthesis prompt updated to handle `relationship` category and Desktop source

## Scripts

### `scripts/generate-api-key.ts`

Takes a username, generates an API key, stores it in admin DB, prints the key. Same pattern as `generate-invite.ts`.

```bash
set -a && source .env.local && set +a && npx tsx scripts/generate-api-key.ts <username> [name]
# Output: obsid_a1b2c3d4...
```

## Not In Scope (Future Extensions)

- **Read access** — vault search and note reading from Claude Desktop (bidirectional MCP)
- **Conversation grouping** — linking multiple saves from one chat session
- **Desktop insights in editor** — surfacing "Claude Desktop noticed..." proactively
- **Batch import** — parsing exported conversation archives
- **Rate limiting** — not needed for single-user v1
- **Tags on Desktop notes** — organize handles it
