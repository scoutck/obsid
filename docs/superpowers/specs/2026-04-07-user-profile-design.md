# User Profile & Insight Collection

## Problem

Obsid's person system tracks people the user knows, but has no way to collect insights about the user themselves. Self-reflective writing, expertise signals, behavioral patterns, and thinking style are scattered across notes with no aggregation point. This is a blind spot — the AI can't build a picture of who the user is.

## Approach

**Piggyback on organize + on-demand synthesis.** The organize call already fires on every note close and reads full note content. Extend it to also harvest self-reflective signals into a `UserInsight` table. When the user opens `/me`, synthesize a profile from accumulated insights on the fly.

Two phases: passive harvesting (always running), active synthesis (on demand).

## Data Model

### `UserInsight` table

Single table for raw observations. No interpretation at storage time — store generously, synthesize on read.

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `category` | String | One of exactly: `"self-reflection"`, `"expertise"`, `"behavior"`, `"thinking-pattern"` (enforced in prompt, validated on insert) |
| `content` | String | The insight (e.g., "Procrastinates on deliverables") |
| `evidence` | String | The raw quote that triggered it |
| `sourceNoteId` | String? | Which note it came from |
| `createdAt` | DateTime | When observed |

No `UserProfile` table. The synthesized view is generated on demand when `/me` is opened. Caching can be added later if performance requires it.

No `confidence` field. That's interpretation, not harvesting. The synthesis pass can weigh insights by recency and frequency.

## Harvesting: Organize Integration

### Prompt extension

Add to the organize system prompt rules:

> "Also scan for self-reflective statements — moments where the author reveals something about themselves: habits, struggles, preferences, expertise, how they think. Not task items ('finish the report') but self-revealing statements ('I always leave reports to the last minute'). Return these as `userInsights`."

### Response JSON extension

```json
{
  "links": ["..."],
  "people": [{"name": "...", "role": "..."}],
  "unresolvedPeople": ["..."],
  "userInsights": [
    {
      "category": "behavior",
      "content": "Tends to procrastinate on deliverables",
      "evidence": "really need to get x done, been sitting on it for a week"
    }
  ]
}
```

### Processing

After parsing the organize response, batch-insert any `userInsights` into the `UserInsight` table with the current `noteId` as `sourceNoteId`. This adds near-zero marginal cost — same API call, slightly longer prompt, a few extra DB writes.

## `/me` Page

### Access

- `/me` slash command in `slash-commands.ts` with `mode: undefined` (available in both notes and chat)
- Adds a `"profile"` view state in `page.tsx` alongside `"notes"` and `"chat"`
- Both `handleSlashCommand` and `handleChatSlashCommand` handle `/me`
- `UserProfilePage` component lazy-loaded via `next/dynamic`

### Page load flow

1. `GET /api/user-insights` — fetch all `UserInsight` rows
2. `POST /api/ai/user-profile` — send insights to Claude for synthesis into a structured profile
3. Display the result

### Page sections

- **AI Summary** — synthesized paragraph about who the user is, generated from all insights
- **Expertise** — topics the user writes about deeply, with relative strength indicators
- **Patterns** — behavioral tendencies the AI has noticed
- **Recent Insights** — feed of raw observations with source note links, so the user can see what's being collected and click through

### Empty state

If no insights exist, show a message explaining the page will populate as the user writes.

## New files

- `prisma/migrations/<timestamp>_add_user_insight/migration.sql` — UserInsight table
- `src/lib/user-insights.ts` — CRUD for UserInsight (accepts optional `db` param per project convention)
- `src/app/api/user-insights/route.ts` — GET (list all), POST (batch create)
- `src/app/api/ai/user-profile/route.ts` — synthesis endpoint
- `src/components/UserProfilePage.tsx` — the `/me` page component

## Modified files

- `prisma/schema.prisma` — add `UserInsight` model
- `src/app/api/ai/organize/route.ts` — extend prompt and response handling
- `src/editor/slash-commands.ts` — add `/me` command
- `src/app/page.tsx` — add `"profile"` view state, handle `/me` in both command handlers, dynamic import `UserProfilePage`

## What this does NOT include

- Chat-based insight harvesting (future — would hook into chat route similarly)
- Confidence scoring or insight decay
- UserProfile caching table
- Deduplication of similar insights (the synthesis pass handles this implicitly)
- User editing/deleting individual insights (future)
