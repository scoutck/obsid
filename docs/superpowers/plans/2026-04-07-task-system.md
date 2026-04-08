# Task System V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight task/to-do system to Obsid with note and person linking, slash command creation, and a modal list view.

**Architecture:** New `Task` Prisma model with optional `noteId`/`personNoteId` foreign keys. `src/lib/tasks.ts` lib module following existing patterns (optional `db` param, parsed return types). `/task` and `/tasks` slash commands in both modes. `TaskModal` component following the `PeopleModal` pattern.

**Tech Stack:** Prisma + SQLite (libsql adapter), Next.js 16 API routes, React (dynamic imports), Vitest

**Spec:** `docs/superpowers/specs/2026-04-07-task-system-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `prisma/migrations/20260407000000_add_task_table/migration.sql` | Task table DDL |
| Modify | `prisma/schema.prisma` | Add Task model |
| Create | `src/types/task.ts` | Task interface + parseTask |
| Modify | `src/types/index.ts` | Re-export from task.ts |
| Create | `src/lib/tasks.ts` | Task CRUD functions |
| Create | `src/app/api/tasks/route.ts` | GET (list/search) + POST (create) |
| Create | `src/app/api/tasks/[id]/route.ts` | PATCH (update) + DELETE |
| Modify | `src/app/api/notes/[id]/route.ts` | Nullify task FKs on note delete |
| Modify | `src/editor/slash-commands.ts` | Add `/task` and `/tasks` commands |
| Create | `src/components/TaskInput.tsx` | Inline task title input (like AiPrompt) |
| Create | `src/components/TaskModal.tsx` | Task list modal UI |
| Modify | `src/app/page.tsx` | Modal state, command handlers, render |
| Create | `tests/lib/tasks.test.ts` | Unit tests for lib/tasks.ts |
| Create | `tests/api/tasks.test.ts` | API route tests |

---

### Task 1: Database Migration + Prisma Schema

**Files:**
- Create: `prisma/migrations/20260407000000_add_task_table/migration.sql`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Create migration SQL**

Create `prisma/migrations/20260407000000_add_task_table/migration.sql`:

```sql
-- CreateTable: Task
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" DATETIME,
    "noteId" TEXT,
    "personNoteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "Task_noteId_idx" ON "Task"("noteId");
CREATE INDEX "Task_personNoteId_idx" ON "Task"("personNoteId");
CREATE INDEX "Task_completed_idx" ON "Task"("completed");
```

- [ ] **Step 2: Add Task model to Prisma schema**

Add to `prisma/schema.prisma` after the `PendingPerson` model:

```prisma
model Task {
  id           String   @id @default(uuid())
  title        String
  completed    Boolean  @default(false)
  dueDate      DateTime?
  noteId       String?
  personNoteId String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([noteId])
  @@index([personNoteId])
  @@index([completed])
}
```

- [ ] **Step 3: Apply migration and generate client**

Run:
```bash
npx prisma migrate deploy && npx prisma generate
```
Expected: Migration applied, client generated with `Task` model available.

- [ ] **Step 4: Verify migration in test DB**

Run:
```bash
npm test -- tests/lib/notes.test.ts
```
Expected: Existing tests still pass (setup.ts applies all migrations including the new one).

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/20260407000000_add_task_table/migration.sql prisma/schema.prisma
git commit -m "feat: add Task table migration and Prisma model"
```

---

### Task 2: Task Type + Parse Function

**Files:**
- Create: `src/types/task.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create Task interface and parseTask**

Create `src/types/task.ts`:

```typescript
export interface Task {
  id: string;
  title: string;
  completed: boolean;
  dueDate: Date | null;
  noteId: string | null;
  personNoteId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function parseTask(raw: {
  id: string;
  title: string;
  completed: boolean;
  dueDate: Date | null;
  noteId: string | null;
  personNoteId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Task {
  return {
    id: raw.id,
    title: raw.title,
    completed: raw.completed,
    dueDate: raw.dueDate,
    noteId: raw.noteId,
    personNoteId: raw.personNoteId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
```

- [ ] **Step 2: Re-export from types/index.ts**

Add to the end of `src/types/index.ts`:

```typescript
export { type Task, parseTask } from "./task";
```

- [ ] **Step 3: Commit**

```bash
git add src/types/task.ts src/types/index.ts
git commit -m "feat: add Task type and parseTask function"
```

---

### Task 3: Task Lib Module (TDD)

**Files:**
- Create: `tests/lib/tasks.test.ts`
- Create: `src/lib/tasks.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/tasks.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  createTask,
  getTask,
  getTasks,
  getTasksForNote,
  getTasksForPerson,
  updateTask,
  deleteTask,
  searchTasks,
} from "@/lib/tasks";
import { createNote } from "@/lib/notes";
import { createPerson } from "@/lib/people";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.task.deleteMany();
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.note.deleteMany();
});

describe("createTask", () => {
  it("creates a standalone task with defaults", async () => {
    const task = await createTask({ title: "Buy groceries" });
    expect(task.id).toBeDefined();
    expect(task.title).toBe("Buy groceries");
    expect(task.completed).toBe(false);
    expect(task.dueDate).toBeNull();
    expect(task.noteId).toBeNull();
    expect(task.personNoteId).toBeNull();
  });

  it("creates a task linked to a note", async () => {
    const note = await createNote({ title: "Meeting notes" });
    const task = await createTask({ title: "Follow up", noteId: note.id });
    expect(task.noteId).toBe(note.id);
    expect(task.personNoteId).toBeNull();
  });

  it("creates a task linked to a person note and auto-sets personNoteId", async () => {
    const person = await createPerson({ name: "Sarah", role: "colleague" });
    const task = await createTask({ title: "Call Sarah", noteId: person.note.id });
    expect(task.noteId).toBe(person.note.id);
    expect(task.personNoteId).toBe(person.note.id);
  });

  it("creates a task linked to a regular note that has a person link", async () => {
    const person = await createPerson({ name: "Sarah", role: "colleague" });
    const note = await createNote({ title: "Meeting with Sarah" });
    await prisma.notePerson.create({
      data: { noteId: note.id, personNoteId: person.note.id },
    });
    const task = await createTask({ title: "Send agenda", noteId: note.id });
    expect(task.noteId).toBe(note.id);
    expect(task.personNoteId).toBe(person.note.id);
  });

  it("creates a task with a due date", async () => {
    const due = new Date("2026-04-10T00:00:00.000Z");
    const task = await createTask({ title: "Deadline task", dueDate: due });
    expect(task.dueDate).toEqual(due);
  });
});

describe("getTasks", () => {
  it("returns tasks ordered: incomplete first by createdAt desc, then completed", async () => {
    const t1 = await createTask({ title: "First" });
    const t2 = await createTask({ title: "Second" });
    const t3 = await createTask({ title: "Third" });
    await updateTask(t1.id, { completed: true });

    const tasks = await getTasks();
    // t3, t2 (incomplete, newest first), then t1 (completed)
    expect(tasks[0].title).toBe("Third");
    expect(tasks[1].title).toBe("Second");
    expect(tasks[2].title).toBe("First");
    expect(tasks[2].completed).toBe(true);
  });
});

describe("getTasksForNote", () => {
  it("returns only tasks for the given note", async () => {
    const note = await createNote({ title: "My note" });
    await createTask({ title: "Linked task", noteId: note.id });
    await createTask({ title: "Standalone task" });

    const tasks = await getTasksForNote(note.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Linked task");
  });
});

describe("getTasksForPerson", () => {
  it("returns only tasks for the given person", async () => {
    const person = await createPerson({ name: "Sarah", role: "colleague" });
    await createTask({ title: "Call Sarah", noteId: person.note.id });
    await createTask({ title: "Unrelated task" });

    const tasks = await getTasksForPerson(person.note.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Call Sarah");
  });
});

describe("updateTask", () => {
  it("toggles completed", async () => {
    const task = await createTask({ title: "Do thing" });
    const updated = await updateTask(task.id, { completed: true });
    expect(updated.completed).toBe(true);
  });

  it("updates title", async () => {
    const task = await createTask({ title: "Old title" });
    const updated = await updateTask(task.id, { title: "New title" });
    expect(updated.title).toBe("New title");
  });

  it("updates dueDate", async () => {
    const task = await createTask({ title: "Task" });
    const due = new Date("2026-04-15T00:00:00.000Z");
    const updated = await updateTask(task.id, { dueDate: due });
    expect(updated.dueDate).toEqual(due);
  });
});

describe("deleteTask", () => {
  it("removes the task", async () => {
    const task = await createTask({ title: "Delete me" });
    await deleteTask(task.id);
    const found = await getTask(task.id);
    expect(found).toBeNull();
  });
});

describe("searchTasks", () => {
  it("finds tasks by title substring", async () => {
    await createTask({ title: "Buy groceries" });
    await createTask({ title: "Call dentist" });

    const results = await searchTasks("grocer");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Buy groceries");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- tests/lib/tasks.test.ts
```
Expected: FAIL — `@/lib/tasks` module does not exist.

- [ ] **Step 3: Implement src/lib/tasks.ts**

Create `src/lib/tasks.ts`:

```typescript
import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import { parseTask, type Task } from "@/types";

interface CreateTaskInput {
  title: string;
  dueDate?: Date;
  noteId?: string;
}

interface UpdateTaskInput {
  title?: string;
  completed?: boolean;
  dueDate?: Date | null;
}

export async function createTask(
  input: CreateTaskInput,
  db: PrismaClient = defaultPrisma
): Promise<Task> {
  let personNoteId: string | null = null;

  if (input.noteId) {
    // Check if the note is a person note
    const note = await db.note.findUnique({
      where: { id: input.noteId },
      select: { id: true, type: true },
    });

    if (note?.type === "person") {
      personNoteId = note.id;
    } else {
      // Check NotePerson links for this note
      const link = await db.notePerson.findFirst({
        where: { noteId: input.noteId },
      });
      if (link) {
        personNoteId = link.personNoteId;
      }
    }
  }

  const raw = await db.task.create({
    data: {
      title: input.title,
      dueDate: input.dueDate ?? null,
      noteId: input.noteId ?? null,
      personNoteId,
    },
  });
  return parseTask(raw);
}

export async function getTask(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<Task | null> {
  const raw = await db.task.findUnique({ where: { id } });
  if (!raw) return null;
  return parseTask(raw);
}

export async function getTasks(
  db: PrismaClient = defaultPrisma
): Promise<Task[]> {
  const incomplete = await db.task.findMany({
    where: { completed: false },
    orderBy: { createdAt: "desc" },
  });
  const completed = await db.task.findMany({
    where: { completed: true },
    orderBy: { createdAt: "desc" },
  });
  return [...incomplete, ...completed].map(parseTask);
}

export async function getTasksForNote(
  noteId: string,
  db: PrismaClient = defaultPrisma
): Promise<Task[]> {
  const raw = await db.task.findMany({
    where: { noteId },
    orderBy: { createdAt: "desc" },
  });
  return raw.map(parseTask);
}

export async function getTasksForPerson(
  personNoteId: string,
  db: PrismaClient = defaultPrisma
): Promise<Task[]> {
  const raw = await db.task.findMany({
    where: { personNoteId },
    orderBy: { createdAt: "desc" },
  });
  return raw.map(parseTask);
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
  db: PrismaClient = defaultPrisma
): Promise<Task> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.completed !== undefined) data.completed = input.completed;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate;

  const raw = await db.task.update({ where: { id }, data });
  return parseTask(raw);
}

export async function deleteTask(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<void> {
  await db.task.delete({ where: { id } });
}

export async function searchTasks(
  query: string,
  db: PrismaClient = defaultPrisma
): Promise<Task[]> {
  const term = `%${query}%`;
  const raw = await db.$queryRawUnsafe<
    Array<{
      id: string;
      title: string;
      completed: boolean;
      dueDate: Date | null;
      noteId: string | null;
      personNoteId: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  >(`SELECT * FROM "Task" WHERE title LIKE ? ORDER BY completed ASC, createdAt DESC`, term);
  return raw.map((r) =>
    parseTask({
      ...r,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    })
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- tests/lib/tasks.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks.ts tests/lib/tasks.test.ts
git commit -m "feat: add task lib module with CRUD and tests"
```

---

### Task 4: API Routes (TDD)

**Files:**
- Create: `tests/api/tasks.test.ts`
- Create: `src/app/api/tasks/route.ts`
- Create: `src/app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Write failing API tests**

Create `tests/api/tasks.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createTask, getTasks } from "@/lib/tasks";
import { createNote } from "@/lib/notes";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.task.deleteMany();
  await prisma.notePerson.deleteMany();
  await prisma.personMeta.deleteMany();
  await prisma.note.deleteMany();
});

describe("GET /api/tasks", () => {
  it("returns all tasks", async () => {
    await createTask({ title: "Task A" });
    await createTask({ title: "Task B" });

    const { GET } = await import("@/app/api/tasks/route");
    const request = new Request("http://localhost/api/tasks");
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
  });

  it("filters by noteId", async () => {
    const note = await createNote({ title: "Test note" });
    await createTask({ title: "Linked", noteId: note.id });
    await createTask({ title: "Standalone" });

    const { GET } = await import("@/app/api/tasks/route");
    const request = new Request(`http://localhost/api/tasks?noteId=${note.id}`);
    const response = await GET(request as any);
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Linked");
  });

  it("searches by query", async () => {
    await createTask({ title: "Buy groceries" });
    await createTask({ title: "Call dentist" });

    const { GET } = await import("@/app/api/tasks/route");
    const request = new Request("http://localhost/api/tasks?q=grocer");
    const response = await GET(request as any);
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Buy groceries");
  });
});

describe("POST /api/tasks", () => {
  it("creates a task", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const request = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New task" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.title).toBe("New task");
    expect(data.completed).toBe(false);
  });
});

describe("PATCH /api/tasks/[id]", () => {
  it("toggles completed", async () => {
    const task = await createTask({ title: "Toggle me" });

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const request = new Request(`http://localhost/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: task.id }),
    });
    const data = await response.json();

    expect(data.completed).toBe(true);
  });
});

describe("DELETE /api/tasks/[id]", () => {
  it("deletes a task", async () => {
    const task = await createTask({ title: "Delete me" });

    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const request = new Request(`http://localhost/api/tasks/${task.id}`, {
      method: "DELETE",
    });
    const response = await DELETE(request as any, {
      params: Promise.resolve({ id: task.id }),
    });
    const data = await response.json();

    expect(data.success).toBe(true);

    const remaining = await getTasks();
    expect(remaining).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- tests/api/tasks.test.ts
```
Expected: FAIL — route modules do not exist.

- [ ] **Step 3: Implement GET/POST route**

Create `src/app/api/tasks/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createTask, getTasks, getTasksForNote, getTasksForPerson, searchTasks } from "@/lib/tasks";

export async function GET(request: NextRequest) {
  const db = getDb(request);
  const noteId = request.nextUrl.searchParams.get("noteId");
  const personNoteId = request.nextUrl.searchParams.get("personNoteId");
  const q = request.nextUrl.searchParams.get("q");

  if (q) {
    const tasks = await searchTasks(q, db);
    return NextResponse.json(tasks);
  }
  if (noteId) {
    const tasks = await getTasksForNote(noteId, db);
    return NextResponse.json(tasks);
  }
  if (personNoteId) {
    const tasks = await getTasksForPerson(personNoteId, db);
    return NextResponse.json(tasks);
  }

  const tasks = await getTasks(db);
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const body = await request.json();
  const task = await createTask(body, db);
  return NextResponse.json(task, { status: 201 });
}
```

- [ ] **Step 4: Implement PATCH/DELETE route**

Create `src/app/api/tasks/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getTask, updateTask, deleteTask } from "@/lib/tasks";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  const body = await request.json();
  const task = await updateTask(id, body, db);
  return NextResponse.json(task);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  await deleteTask(id, db);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
npm test -- tests/api/tasks.test.ts
```
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tasks/route.ts src/app/api/tasks/[id]/route.ts tests/api/tasks.test.ts
git commit -m "feat: add task API routes with tests"
```

---

### Task 5: Note Deletion Cascade

**Files:**
- Modify: `src/app/api/notes/[id]/route.ts`

- [ ] **Step 1: Add task nullification to DELETE handler**

In `src/app/api/notes/[id]/route.ts`, add these two lines after the `pendingPerson` update (line 51) and before `deleteNote`:

```typescript
  await db.task.updateMany({
    where: { noteId: id },
    data: { noteId: null },
  });
  await db.task.updateMany({
    where: { personNoteId: id },
    data: { personNoteId: null },
  });
```

The full DELETE handler after the edit:

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb(request);
  const { id } = await params;
  await deleteCommandsForNote(id, db);
  await db.embedding.deleteMany({ where: { noteId: id } });
  await db.notePerson.deleteMany({ where: { noteId: id } });
  await db.notePerson.deleteMany({ where: { personNoteId: id } });
  await db.personMeta.deleteMany({ where: { noteId: id } });
  await db.pendingPerson.updateMany({
    where: { sourceNoteId: id },
    data: { sourceNoteId: null },
  });
  await db.task.updateMany({
    where: { noteId: id },
    data: { noteId: null },
  });
  await db.task.updateMany({
    where: { personNoteId: id },
    data: { personNoteId: null },
  });
  await deleteNote(id, db);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Run existing note deletion tests to verify no regressions**

Run:
```bash
npm test -- tests/api/
```
Expected: All existing API tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notes/[id]/route.ts
git commit -m "feat: nullify task FKs on note deletion"
```

---

### Task 6: Slash Commands

**Files:**
- Modify: `src/editor/slash-commands.ts`

- [ ] **Step 1: Add task commands to the commands array**

In `src/editor/slash-commands.ts`, add these two entries to the `slashCommands` array. Insert them after the Organization section (after the `"org:pending-people"` entry, before the AI section):

```typescript
  // Tasks
  { label: "New Task", category: "Organization", description: "Create a task", action: "task:create" },
  { label: "Tasks", category: "Organization", description: "View all tasks", action: "task:list" },
```

No `mode` field — these work in both modes.

- [ ] **Step 2: Verify the filter still works**

Run:
```bash
npx tsc --noEmit
```
Expected: No type errors. The category `"Organization"` is already in the union.

- [ ] **Step 3: Commit**

```bash
git add src/editor/slash-commands.ts
git commit -m "feat: add /task and /tasks slash commands"
```

---

### Task 7: TaskInput + TaskModal Components

**Files:**
- Create: `src/components/TaskInput.tsx`
- Create: `src/components/TaskModal.tsx`

- [ ] **Step 1: Create the TaskInput component**

The slash menu removes the `/task` text before the handler runs, so we can't read a title from the editor line. Instead, `/task` opens a small inline input (following the `AiPrompt` pattern) where the user types the task title and presses Enter.

Create `src/components/TaskInput.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";

interface TaskInputProps {
  onSubmit: (title: string) => void;
  onClose: () => void;
}

export default function TaskInput({ onSubmit, onClose }: TaskInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      onSubmit(value.trim());
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="my-2 flex items-center gap-2 px-3 py-2 bg-white border border-zinc-300 rounded-lg shadow-sm">
      <span className="text-zinc-600 text-sm font-medium">Task</span>
      <input
        ref={inputRef}
        type="text"
        placeholder="What needs to be done?"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onClose}
        className="flex-1 bg-transparent text-zinc-900 text-sm outline-none placeholder-zinc-400"
      />
      <span className="text-xs text-zinc-400">Enter to create</span>
    </div>
  );
}
```

- [ ] **Step 2: Create the TaskModal component**

Create `src/components/TaskModal.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Task } from "@/types";

interface TaskModalProps {
  onNavigateToNote: (noteId: string) => void;
  onClose: () => void;
}

export default function TaskModal({ onNavigateToNote, onClose }: TaskModalProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "overdue" | string>("all");
  const [people, setPeople] = useState<Array<{ noteId: string; name: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    else if (filter !== "all" && filter !== "overdue") params.set("personNoteId", filter);

    const res = await fetch(`/api/tasks${params.toString() ? "?" + params : ""}`);
    let data: Task[] = await res.json();

    // Client-side overdue filter
    if (filter === "overdue") {
      const now = new Date();
      data = data.filter((t) => !t.completed && t.dueDate && new Date(t.dueDate) < now);
    }

    setTasks(data);
    setLoading(false);
  }, [search, filter]);

  const fetchPeople = useCallback(async () => {
    const res = await fetch("/api/people");
    const data = await res.json();
    setPeople(data.map((p: { note: { id: string; title: string } }) => ({
      noteId: p.note.id,
      name: p.note.title,
    })));
  }, []);

  useEffect(() => { fetchPeople(); }, [fetchPeople]);

  useEffect(() => {
    const timer = setTimeout(fetchTasks, 200);
    return () => clearTimeout(timer);
  }, [fetchTasks]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function toggleComplete(taskId: string, completed: boolean) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !completed }),
    });
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !completed } : t))
    );
  }

  function formatDueDate(dueDate: string | Date | null) {
    if (!dueDate) return null;
    const d = new Date(dueDate);
    const now = new Date();
    const isOverdue = !isNaN(d.getTime()) && d < now;
    const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return (
      <span className={`text-xs ${isOverdue ? "text-red-400" : "text-zinc-400"}`}>
        {formatted}
      </span>
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-zinc-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <h2 className="font-semibold text-zinc-900">Tasks</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 text-sm"
          >
            Close
          </button>
        </div>

        <div className="px-4 py-2 border-b border-zinc-100">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1.5 text-sm bg-transparent text-zinc-900 placeholder-zinc-400 outline-none"
          />
          <div className="flex gap-1.5 mt-1.5 mb-1 flex-wrap">
            <button
              onClick={() => setFilter("all")}
              className={`text-xs px-2 py-0.5 rounded-full ${
                filter === "all"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("overdue")}
              className={`text-xs px-2 py-0.5 rounded-full ${
                filter === "overdue"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              Overdue
            </button>
            {people.map((p) => (
              <button
                key={p.noteId}
                onClick={() => setFilter(p.noteId)}
                className={`text-xs px-2 py-0.5 rounded-full ${
                  filter === p.noteId
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">
              Loading...
            </div>
          ) : tasks.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-400 text-sm">
              No tasks found
            </div>
          ) : (
            <div className="py-1">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-start gap-2.5 px-4 py-2 hover:bg-zinc-50 ${
                    task.completed ? "opacity-40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleComplete(task.id, task.completed)}
                    className="mt-0.5 rounded border-zinc-300 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm ${
                        task.completed
                          ? "line-through text-zinc-400"
                          : "text-zinc-800"
                      }`}
                    >
                      {task.title}
                    </span>
                    {task.noteId && (
                      <button
                        onClick={() => {
                          onNavigateToNote(task.noteId!);
                          onClose();
                        }}
                        className="block text-xs text-blue-400 hover:text-blue-600 truncate"
                      >
                        Open note
                      </button>
                    )}
                  </div>
                  {formatDueDate(task.dueDate)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify both compile**

Run:
```bash
npx tsc --noEmit
```
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TaskInput.tsx src/components/TaskModal.tsx
git commit -m "feat: add TaskInput and TaskModal components"
```

---

### Task 8: Wire Up page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add dynamic imports**

Add after the other dynamic imports (after the `PendingPeopleModal` import):

```typescript
const TaskInput = dynamic(() => import("@/components/TaskInput"));
const TaskModal = dynamic(() => import("@/components/TaskModal"));
```

- [ ] **Step 2: Add state variables**

Add after the `showPendingPeople` state declaration (around line 47):

```typescript
const [showTaskInput, setShowTaskInput] = useState(false);
const [showTaskModal, setShowTaskModal] = useState(false);
```

- [ ] **Step 3: Add task creation handler**

Add a `handleCreateTask` callback near the other handlers:

```typescript
  const handleCreateTask = useCallback(
    (title: string) => {
      setShowTaskInput(false);
      fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, noteId: noteId ?? undefined }),
      }).then(() => setToast("Task created"));
    },
    [noteId]
  );
```

- [ ] **Step 4: Add handler in handleSlashCommand**

Add before the `console.log("Unhandled command:")` line at the end of `handleSlashCommand`:

```typescript
      if (command.action === "task:create") {
        setShowTaskInput(true);
        return;
      }

      if (command.action === "task:list") {
        setShowTaskModal(true);
        return;
      }
```

- [ ] **Step 5: Add handler in handleChatSlashCommand**

Add before the closing `}` of the `handleChatSlashCommand` callback, inside the else-if chain:

```typescript
      } else if (action === "task" || action === "task:create") {
        setShowTaskInput(true);
      } else if (action === "tasks" || action === "task:list") {
        setShowTaskModal(true);
      }
```

- [ ] **Step 6: Add TaskInput and TaskModal renders**

Add after the `PendingPeopleModal` render block (after line ~681):

```tsx
      {showTaskInput && (
        <TaskInput
          onSubmit={handleCreateTask}
          onClose={() => setShowTaskInput(false)}
        />
      )}
      {showTaskModal && (
        <TaskModal
          onNavigateToNote={(id) => {
            setShowTaskModal(false);
            loadNote(id);
          }}
          onClose={() => setShowTaskModal(false)}
        />
      )}
```

- [ ] **Step 7: Verify compilation**

Run:
```bash
npx tsc --noEmit
```
Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire TaskInput, TaskModal and task commands into page"
```

---

### Task 9: Test Cleanup Order Update

**Files:**
- Modify: `tests/lib/tasks.test.ts` (already created in Task 3 — verify cleanup is correct)

The `beforeEach` in `tests/lib/tasks.test.ts` already deletes `task` before `note`, which respects the FK constraint direction. But other test files that create notes need to also clean up tasks if they exist. Check that existing test files won't break.

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```
Expected: All tests pass. The new `Task` table has no FK constraints enforced by Prisma (no `@relation`), so existing tests that `deleteMany` on `note` won't fail — tasks just become orphaned with dangling `noteId` strings, which is fine in tests.

- [ ] **Step 2: If any tests fail, fix cleanup order**

If a test file fails, add `await prisma.task.deleteMany();` before `await prisma.note.deleteMany();` in that file's `beforeEach`. (This is unlikely since SQLite doesn't enforce FK constraints without `PRAGMA foreign_keys = ON`.)

- [ ] **Step 3: Commit (if changes needed)**

```bash
git add tests/
git commit -m "fix: update test cleanup order for Task table"
```

---

### Task 10: Final Integration Verification

- [ ] **Step 1: Type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 2: Lint**

Run:
```bash
npm run lint
```
Expected: No errors.

- [ ] **Step 3: Full test suite**

Run:
```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 4: Build check**

Run:
```bash
npm run build
```
Expected: Build succeeds. TaskModal is dynamically imported so it won't cause SSR issues.

- [ ] **Step 5: Dev server smoke test**

Run:
```bash
npm run dev
```
Manual check:
1. Type `/task` in a note, select "New Task" — TaskInput appears, type "Buy groceries", press Enter — should see "Task created" toast
2. Type `/tasks` — should see TaskModal with the task listed
3. Check the checkbox — task should grey out with strikethrough
4. Create a task from a person note — verify person linking works
5. Open chat mode, use `/task` — TaskInput appears, creates standalone task
