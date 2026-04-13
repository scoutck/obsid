"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import type { TaskWithNote } from "@/types";
import TaskItem from "./TaskItem";

interface NoteTasksProps {
  noteId: string;
  createTrigger?: number;
}

export default function NoteTasks({ noteId, createTrigger = 0 }: NoteTasksProps) {
  const [tasks, setTasks] = useState<TaskWithNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const prevTrigger = useRef(createTrigger);

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`/api/tasks?noteId=${noteId}`);
    if (res.ok) {
      setTasks(await res.json());
    }
    setLoaded(true);
  }, [noteId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Slash command trigger — open create mode
  useEffect(() => {
    if (createTrigger > 0 && createTrigger !== prevTrigger.current) {
      setCreating(true);
      prevTrigger.current = createTrigger;
    }
  }, [createTrigger]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  async function handleCreate() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed, noteId }),
    });

    if (res.ok) {
      const task = await res.json();
      setTasks((prev) => [{ ...task, noteTitle: null }, ...prev]);
      setNewTitle("");
      // Keep input open for rapid entry
      inputRef.current?.focus();
    }
  }

  function handleToggle(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
    fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
  }

  function handleUpdate(id: string, updates: { title?: string; dueDate?: string | null }) {
    const stateUpdates: { title?: string; dueDate?: Date | null } = {
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.dueDate !== undefined
        ? { dueDate: updates.dueDate ? new Date(updates.dueDate) : null }
        : {}),
    };
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...stateUpdates } : t))
    );
    fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  if (!loaded) return null;

  const incomplete = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  const hasTasks = tasks.length > 0;

  // Show just the + button when no tasks exist (unless slash command activated creating)
  if (!hasTasks && !creating) {
    return (
      <div className="mt-8 flex justify-center">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors duration-[120ms] font-[var(--font-ui)]"
        >
          <Plus size={14} strokeWidth={1.75} />
          Add task
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
      {/* Task list */}
      <div className="space-y-0">
        {incomplete.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onToggle={handleToggle}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}

        {/* Inline create input */}
        {creating ? (
          <div className="flex items-center gap-2.5 py-1.5 px-1">
            <div className="w-[18px] h-[18px] rounded border-[1.5px] border-[var(--border-default)] shrink-0" />
            <input
              ref={inputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) handleCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewTitle("");
                }
              }}
              onBlur={() => {
                if (!newTitle.trim()) {
                  setCreating(false);
                  setNewTitle("");
                }
              }}
              placeholder="New task..."
              className="flex-1 bg-transparent outline-none text-sm font-[var(--font-body)] text-[var(--text-body)] placeholder:text-[var(--text-disabled)] leading-snug"
            />
            <span className="text-[10px] text-[var(--text-disabled)] font-[var(--font-ui)] shrink-0">
              Enter
            </span>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-xs text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors duration-[120ms] font-[var(--font-ui)] py-1.5 px-1"
          >
            <Plus size={14} strokeWidth={1.75} />
            Add task
          </button>
        )}

        {/* Completed tasks — faded section */}
        {completed.length > 0 && (
          <div className="mt-3 pt-2 border-t border-[var(--border-subtle)]">
            {completed.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={handleToggle}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
