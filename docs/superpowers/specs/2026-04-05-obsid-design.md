# Obsid — AI-Powered Knowledge Base

## Overview

Obsid is a web-based markdown knowledge base with an integrated AI assistant. It combines the note-taking strengths of Obsidian with the AI capabilities of Claude Code into a single, minimal interface. The AI lives inside the app — no context-switching between tools.

**Target user:** Someone who thinks in markdown, wants their notes searchable and interconnected, and wants an AI that can reason across their knowledge base.

## Principles

- **Minimal UI** — full-width editor only. Nothing else in v1.
- **Slash menu is the hub** — type `/` in the editor for navigation, creation, search, formatting, and AI.
- **Flat notes, not folders** — notes have metadata (tags, type, links). Collections are saved filters, not directories.
- **AI is vault-aware** — Claude can search, read, create, and update notes.
- **Local-first** — SQLite storage, works without internet (except AI features).

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js (App Router) | Full-stack, easy to deploy, future Electron/Tauri path |
| Editor | CodeMirror 6 | Battle-tested markdown editor, extensible, same engine as Obsidian |
| Database | SQLite (via Prisma) | Local-first, full-text search via FTS5, simple |
| AI | Claude API (Anthropic SDK) | Tool calling for vault operations |
| Styling | Tailwind CSS | Utility-first, fast iteration |

## UI Layout

```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│            Editor Area                      │
│                                             │
│   Full-width markdown editing               │
│   Type / for command menu                   │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

One element. The editor.

### Slash Command Menu (`/`)

Type `/` in the editor to open a floating dropdown menu at the cursor (Obsidian-style). Filter by typing, navigate with arrow keys, select with Enter, dismiss with Escape.

**Formatting** (wraps selected text or inserts syntax at cursor)**:**
- Bold — wrap with `**`
- Italic — wrap with `*`
- Strikethrough — wrap with `~~`
- Highlight — wrap with `==`
- Heading 1 — insert `# `
- Heading 2 — insert `## `
- Bullet list — insert `- `
- Numbered list — insert `1. `
- Divider — insert `---`

**Notes:**
- New note — create a new note
- Open note — search and open an existing note
- Daily note — create or open today's daily note

**Organization:**
- Add tag — tag the current note
- Add wiki-link — insert `[[ ]]` and search for a note to link
- Search notes — full-text search across all notes
- Open collection — open a saved collection
- New collection — create a collection from a filter

**AI:**
- Ask Claude — opens an inline prompt, sends natural language to Claude

When "Ask Claude" is selected, a text input appears at the cursor. The user types their prompt and hits Enter. Claude's response appears below as a visually distinct block. Examples:
- "summarize this note"
- "what did I write about authentication last week?"
- "log this idea: we should try event sourcing"
- "what are my open questions?"

### Editor Area

- Full-width CodeMirror 6 markdown editor
- Inline live preview (headings, bold, links render in-place as you type — no split pane)
- Wiki-link support (`[[note title]]`) for connecting notes
- Auto-save on change
- No keyboard shortcuts for formatting — use markdown syntax or `/` slash menu

## Data Model

### Note

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| title | string | Derived from first heading or first line |
| content | text | Raw markdown |
| tags | string[] | User-defined tags |
| type | string | Free-form: "decision", "idea", "meeting", etc. |
| links | uuid[] | IDs of notes referenced via `[[wiki-links]]` |
| createdAt | datetime | Auto-set |
| updatedAt | datetime | Auto-updated on save |

### Collection

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| name | string | Display name ("Decisions", "This Week") |
| filter | json | Query definition: `{ tags: ["decision"], dateRange: "this-week" }` |
| createdAt | datetime | Auto-set |

### Organization model

- No folders, no hierarchy
- Notes are flat with metadata (tags, type, links)
- Collections are saved filter views over notes
- Wiki-links (`[[note title]]`) create connections between notes
- AI suggests tags on note creation; user approves

## AI Capabilities (v1)

Claude is invoked via "Ask Claude" in the slash menu. It has access to the vault through tool calls:

| Tool | Description |
|------|-------------|
| `search_notes` | Find notes by content, tags, or type |
| `read_note` | Get full content of a specific note |
| `create_note` | Create a new note with content, tags, type |
| `update_note` | Append to or edit an existing note |

Claude does NOT have in v1:
- Shell/terminal access
- External web access
- Anything outside the vault

### AI Response Display

Responses appear inline in the editor as a visually distinct block:

```
Your writing here...

> /ask what are the pros of SQLite?
┌─ Claude ─────────────────────────────────┐
│ SQLite is great for local-first apps     │
│ because...                               │
│                                [Keep] [Dismiss]
└──────────────────────────────────────────┘

Your writing continues...
```

- Response streams in real-time inside the block
- **Keep** — converts the response to normal markdown in the note
- **Dismiss** — removes the block entirely
- For actions that create or open notes, the editor navigates to the new/opened note

## User Flow

1. **Launch** — opens to a blank editor (or last opened note). No onboarding.
2. **Create a note** — `/` → New note, or just start typing (auto-creates untitled note)
3. **Write and format** — type markdown directly, or use `/` slash menu for formatting
4. **Navigate** — `/` → Open note (search), Daily note, Open collection, or click a `[[wiki-link]]`
5. **Organize** — `/` → Add tag, Add wiki-link, Search notes, New collection
6. **Use AI** — `/` → Ask Claude → type prompt → response appears inline → Keep or Dismiss
7. **Close / reopen** — notes persist in SQLite, pick up where you left off

## What's NOT in v1

- No sidebar, status bar, or command bar
- No keyboard shortcuts for formatting
- No graph view or backlinks panel
- No templates
- No shell/terminal execution
- No external web access for AI
- No auth/multi-user
- No Obsidian import
- No desktop app

## Future (v2+)

These are explicitly out of scope for v1 but inform the architecture:

- **Graph view** — visual map of note connections
- **Shell execution** — Claude can run commands
- **Desktop app** — wrap in Electron or Tauri
- **Backlinks panel** — see what links to the current note
- **Templates** — reusable note structures
- **Import from Obsidian** — pull in existing vaults
