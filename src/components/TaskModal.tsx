"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Task } from "@/types";
import { X } from "lucide-react";

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
  const [noteNames, setNoteNames] = useState<Record<string, string>>({});
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

    // Fetch note titles for linked tasks
    const noteIds = [...new Set(data.map((t) => t.noteId).filter(Boolean))] as string[];
    if (noteIds.length > 0) {
      const names: Record<string, string> = {};
      const results = await Promise.all(
        noteIds.map((id) => fetch(`/api/notes/${id}`).then((r) => r.ok ? r.json() : null))
      );
      results.forEach((note) => {
        if (note) names[note.id] = note.title;
      });
      setNoteNames(names);
    }

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 animate-[modal-overlay-in_200ms_ease-out]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-zinc-200 animate-[modal-content-in_250ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <h2 className="font-semibold text-zinc-900">Tasks</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors duration-[120ms] p-1 -m-1"
          >
            <X size={18} strokeWidth={1.75} />
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
                  className={`flex items-start gap-2.5 px-4 py-2 hover:bg-zinc-50 transition-colors duration-[120ms] ${
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
                    <div className="flex items-center gap-2">
                      {task.noteId && noteNames[task.noteId] && (
                        <button
                          onClick={() => {
                            onNavigateToNote(task.noteId!);
                            onClose();
                          }}
                          className="text-xs text-indigo-500 hover:text-indigo-700 truncate transition-colors duration-[120ms]"
                        >
                          {noteNames[task.noteId]}
                        </button>
                      )}
                      {task.personNoteId && (
                        <span className="text-xs text-zinc-400">
                          {people.find((p) => p.noteId === task.personNoteId)?.name}
                        </span>
                      )}
                    </div>
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
