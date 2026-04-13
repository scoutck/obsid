// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
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
    const response = await GET(request as unknown as NextRequest);
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
    const response = await GET(request as unknown as NextRequest);
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Linked");
  });

  it("searches by query", async () => {
    await createTask({ title: "Buy groceries" });
    await createTask({ title: "Call dentist" });

    const { GET } = await import("@/app/api/tasks/route");
    const request = new Request("http://localhost/api/tasks?q=grocer");
    const response = await GET(request as unknown as NextRequest);
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Buy groceries");
  });

  it("includes noteTitle for linked tasks", async () => {
    const note = await createNote({ title: "My Note" });
    await createTask({ title: "Linked task", noteId: note.id });
    await createTask({ title: "Standalone task" });

    const { GET } = await import("@/app/api/tasks/route");
    const request = new Request("http://localhost/api/tasks");
    const response = await GET(request as unknown as NextRequest);
    const data = await response.json();

    const linked = data.find((t: { title: string }) => t.title === "Linked task");
    const standalone = data.find((t: { title: string }) => t.title === "Standalone task");

    expect(linked.noteTitle).toBe("My Note");
    expect(standalone.noteTitle).toBeNull();
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
    const response = await POST(request as unknown as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.title).toBe("New task");
    expect(data.completed).toBe(false);
  });

  it("rejects empty title", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const request = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    const response = await POST(request as unknown as NextRequest);
    expect(response.status).toBe(400);
  });

  it("rejects missing title", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const request = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request as unknown as NextRequest);
    expect(response.status).toBe(400);
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
    const response = await PATCH(request as unknown as NextRequest, {
      params: Promise.resolve({ id: task.id }),
    });
    const data = await response.json();

    expect(data.completed).toBe(true);
  });

  it("returns 404 for non-existent task", async () => {
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const request = new Request("http://localhost/api/tasks/nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    const response = await PATCH(request as unknown as NextRequest, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/tasks/[id]", () => {
  it("deletes a task", async () => {
    const task = await createTask({ title: "Delete me" });

    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const request = new Request(`http://localhost/api/tasks/${task.id}`, {
      method: "DELETE",
    });
    const response = await DELETE(request as unknown as NextRequest, {
      params: Promise.resolve({ id: task.id }),
    });
    const data = await response.json();

    expect(data.success).toBe(true);

    const remaining = await getTasks();
    expect(remaining).toHaveLength(0);
  });

  it("returns 404 for non-existent task", async () => {
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const request = new Request("http://localhost/api/tasks/nonexistent", {
      method: "DELETE",
    });
    const response = await DELETE(request as unknown as NextRequest, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(response.status).toBe(404);
  });
});
