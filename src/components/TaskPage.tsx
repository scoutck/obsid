"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import type { TaskWithNote } from "@/types";
import TaskItem from "./TaskItem";

interface TaskPageProps {
  onSelectNote: (noteId: string) => void;
  onBack: () => void;
}

export default function TaskPage({ onSelectNote, onBack }: TaskPageProps) {
  const [tasks, setTasks] = useState<TaskWithNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "upcoming" | "overdue">("all");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);

    const res = await fetch(`/api/tasks${params.toString() ? "?" + params : ""}`);
    if (res.ok) {
      let data: TaskWithNote[] = await res.json();

      const now = new Date();
      if (filter === "upcoming") {
        data = data.filter((t) => !t.completed && t.dueDate && new Date(t.dueDate) >= now);
      } else if (filter === "overdue") {
        data = data.filter((t) => !t.completed && t.dueDate && new Date(t.dueDate) < now);
      }

      setTasks(data);
    }
    setLoading(false);
  }, [search, filter]);

  useEffect(() => {
    const timer = setTimeout(fetchTasks, 200);
    return () => clearTimeout(timer);
  }, [fetchTasks]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (creating) createRef.current?.focus();
  }, [creating]);

  async function handleCreate() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });

    if (res.ok) {
      const task = await res.json();
      setTasks((prev) => [{ ...task, noteTitle: null }, ...prev]);
      setNewTitle("");
      setCreating(false);
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
    const stateUpdates: { title?: string; dueDate?: Date | null } = {};
    if (updates.title !== undefined) stateUpdates.title = updates.title;
    if ("dueDate" in updates) {
      stateUpdates.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    }
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

  const incomplete = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  const filters: Array<{ key: "all" | "upcoming" | "overdue"; label: string }> = [
    { key: "all", label: "All" },
    { key: "upcoming", label: "Upcoming" },
    { key: "overdue", label: "Overdue" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[720px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-[120ms] -ml-1 p-1"
            aria-label="Back"
          >
            <ArrowLeft size={20} strokeWidth={1.75} />
          </button>
          <h1 className="text-xl font-bold font-[var(--font-body)] text-[var(--text-primary)]">
            Tasks
          </h1>
        </div>

        {/* Search */}
        <input
          ref={searchRef}
          type="text"
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent border-b border-[var(--border-default)] px-1 py-2 text-sm text-[var(--text-body)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors duration-[120ms] font-[var(--font-ui)] mb-4"
        />

        {/* Filters */}
        <div className="flex items-center gap-1.5 mb-5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors duration-[120ms] font-[var(--font-ui)] ${
                filter === f.key
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Add standalone task */}
        {creating ? (
          <div className="flex items-center gap-2.5 py-1.5 px-1 mb-4">
            <div className="w-[18px] h-[18px] rounded border-[1.5px] border-[var(--border-default)] shrink-0" />
            <input
              ref={createRef}
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
            className="flex items-center gap-1.5 text-xs text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors duration-[120ms] font-[var(--font-ui)] mb-4 py-1.5 px-1"
          >
            <Plus size={14} strokeWidth={1.75} />
            Add task
          </button>
        )}

        {/* Task list */}
        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--text-tertiary)] font-[var(--font-ui)]">
            Loading...
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-disabled)] font-[var(--font-ui)]">
            {search ? "No matching tasks" : "No tasks yet"}
          </div>
        ) : (
          <div>
            {/* Incomplete */}
            <div className="space-y-0">
              {incomplete.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onNavigateToNote={(id) => {
                    onSelectNote(id);
                  }}
                  showNoteLink
                />
              ))}
            </div>

            {/* Completed section */}
            {completed.length > 0 && (
              <>
                <div className="flex items-center gap-3 mt-6 mb-3">
                  <div className="flex-1 border-t border-[var(--border-subtle)]" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] font-[var(--font-ui)]">
                    Completed
                  </span>
                  <div className="flex-1 border-t border-[var(--border-subtle)]" />
                </div>
                <div className="space-y-0">
                  {completed.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={handleToggle}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                      onNavigateToNote={(id) => {
                        onSelectNote(id);
                      }}
                      showNoteLink
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
