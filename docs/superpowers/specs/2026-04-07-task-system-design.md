# Task System — V1 Design Spec

## Overview

A lightweight task/to-do system for Obsid. Tasks are first-class entities with optional links to notes and people. Created via slash commands in both notes and chat mode, viewed in a modal.

V1 is user-created only. AI-suggested tasks, projects/lists, recurring tasks, and tags are deferred to V2.

## Data Model

New `Task` table in `prisma/schema.prisma`:

| Field          | Type      | Notes                                           |
|----------------|-----------|------------------------------------------------|
| `id`           | String    | cuid, primary key                              |
| `title`        | String    | Required                                        |
| `completed`    | Boolean   | Default `false`                                 |
| `dueDate`      | DateTime? | Optional, user-entered                          |
| `noteId`       | String?   | FK to parent Note (where task was created)      |
| `personNoteId` | String?   | FK to Note (the linked person note)             |
| `createdAt`    | DateTime  | Auto                                            |
| `updatedAt`    | DateTime  | Auto                                            |

**Linking rules:**
- Created from a person note: `noteId` and `personNoteId` both point to that note.
- Created from a regular note linked to a person: `noteId` is the note, `personNoteId` is the person's note.
- Created from a note with no person link: `noteId` set, `personNoteId` null.
- Standalone (no note open, or created in chat mode): both null.

**On note deletion:** Nullify `noteId` and `personNoteId` on affected tasks. Tasks survive — they just lose their link.

No Prisma `@relation` directives (consistent with the rest of the schema). Cascade handled manually in the delete route.

## Slash Commands

Two new commands added to `src/editor/slash-commands.ts`:

- `/task <title>` — Create a task. Action: `task:create`. No `mode` field (works in both modes).
- `/tasks` — Open task list modal. Action: `task:list`. No `mode` field.

Both need handlers in `handleSlashCommand` (notes) and `handleChatSlashCommand` (chat).

## Creation Flow

### Notes mode
1. User types `/task Call Sarah about the project`
2. Slash text removed from editor (existing pattern)
3. POST `/api/tasks` with `{ title, noteId, personNoteId }`
4. Person resolution: API checks if note is a person note (`type: "person"`) — if so, `personNoteId = noteId`. Otherwise, looks up `NotePerson` links for that note and uses the first linked person by `personNoteId` (arbitrary but deterministic; tasks can be re-linked manually later if needed), or null if none.
5. Toast: "Task created"

### Chat mode
1. User types `/task Call Sarah about the project`
2. POST `/api/tasks` with `{ title }` — no note context available, both FKs null.
3. Toast: "Task created"

## Backend

### `src/lib/tasks.ts`

All functions accept optional `db: PrismaClient` parameter (per project convention):

- `createTask(input, db)` — create task, resolve person from note if applicable
- `getTasks(db)` — all tasks, ordered: incomplete first (by `createdAt` desc), then completed
- `getTasksForNote(noteId, db)` — tasks linked to a specific note
- `getTasksForPerson(personNoteId, db)` — tasks linked to a person
- `updateTask(id, input, db)` — toggle completed, update title/dueDate
- `deleteTask(id, db)` — hard delete
- `searchTasks(query, db)` — LIKE search on title

### API Routes

**`/api/tasks/route.ts`:**
- `GET` — list all tasks. Optional query params: `?noteId=`, `?personNoteId=`, `?q=` (search).
- `POST` — create task. Body: `{ title, noteId?, personNoteId? }`.

**`/api/tasks/[id]/route.ts`:**
- `PATCH` — update task. Body: `{ completed?, title?, dueDate? }`.
- `DELETE` — delete task.

## Task List Modal

`TaskModal` component, dynamically imported in `page.tsx` (per project convention for modals).

### Layout
- Title bar: "Tasks"
- Text input at top for searching by title
- Filter pills: "All", "By Person" (dropdown of linked people), "Overdue"
- Task list, ordered: incomplete first (by `createdAt` desc), then completed (greyed out) below

### Task Row
- Checkbox — click to toggle complete (PATCH API call)
- Title
- Due date (subtle, right-aligned) if present
- Parent note name as small link — click navigates to note, closes modal
- Person name as small label if linked

### Interactions
- Toggle complete: checkbox click, immediate PATCH, task greys out in place
- Navigate to note: click note link, close modal, open note
- Completed tasks stay visible, greyed out, no hide/show toggle
- No drag-and-drop or reordering for V1

### Behavior
- Close on Escape or click outside (existing modal pattern)
- State refreshes on open (fetch all tasks on mount)

## Integration Points

### Note deletion cascade
Add to existing DELETE `/api/notes/[id]` handler, before note delete:
- Nullify `noteId` on tasks where `noteId` matches deleted note
- Nullify `personNoteId` on tasks where `personNoteId` matches deleted note

### Embeddings
Tasks ride the parent note's embedding. No separate embedding work. Semantic search surfaces notes; tasks are discoverable through their `noteId` relationship.

### No editor extensions
Tasks are not rendered inline in note content. Created via `/task`, viewed via `/tasks` modal. No CodeMirror decorations needed for V1.

## Out of Scope (V2)

- AI-suggested tasks
- Projects / list grouping
- Recurring tasks
- Tags on tasks
- Dedicated task mode (`/taskmode`)
- Separate task embeddings / direct task search
- Drag-and-drop reordering
- Task priorities beyond due date
