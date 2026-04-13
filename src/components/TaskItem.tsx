"use client";

import { useState, useRef, useEffect } from "react";
import { Trash2, Calendar } from "lucide-react";
import type { TaskWithNote } from "@/types";

interface TaskItemProps {
  task: TaskWithNote;
  onToggle: (id: string) => void;
  onUpdate: (id: string, updates: { title?: string; dueDate?: string | null }) => void;
  onDelete: (id: string) => void;
  onNavigateToNote?: (noteId: string) => void;
  showNoteLink?: boolean;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(date: Date | string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

function toDateInputValue(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function TaskItem({
  task,
  onToggle,
  onUpdate,
  onDelete,
  onNavigateToNote,
  showNoteLink = false,
}: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const editRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(task.title);
  }, [task.title]);

  function commitEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate(task.id, { title: trimmed });
    } else {
      setEditValue(task.title);
    }
    setEditing(false);
  }

  return (
    <div
      className={`group flex items-start gap-2.5 py-1.5 px-1 -mx-1 rounded-md transition-colors duration-[120ms] hover:bg-[var(--bg-subtle)] ${
        task.completed ? "opacity-40" : ""
      }`}
    >
      {/* Custom checkbox */}
      <button
        onClick={() => onToggle(task.id)}
        className={`w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 transition-colors duration-[120ms] cursor-pointer ${
          task.completed
            ? "bg-[var(--accent)] border-[var(--accent)]"
            : "border-[var(--border-strong)] hover:border-[var(--accent)]"
        }`}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {task.completed && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Title — editable on click */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                setEditValue(task.title);
                setEditing(false);
              }
            }}
            onBlur={commitEdit}
            className="w-full bg-transparent outline-none text-sm font-[var(--font-body)] text-[var(--text-body)] leading-snug"
          />
        ) : (
          <span
            onClick={() => !task.completed && setEditing(true)}
            className={`text-sm font-[var(--font-body)] leading-snug ${
              task.completed
                ? "line-through text-[var(--text-tertiary)] cursor-default"
                : "text-[var(--text-body)] cursor-text"
            }`}
          >
            {task.title}
          </span>
        )}

        {/* Note link (only in TaskPage) */}
        {showNoteLink && task.noteId && task.noteTitle && onNavigateToNote && (
          <button
            onClick={() => onNavigateToNote(task.noteId!)}
            className="block text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] truncate transition-colors duration-[120ms] mt-0.5 font-[var(--font-ui)]"
          >
            {task.noteTitle}
          </button>
        )}
      </div>

      {/* Due date */}
      <div className="flex items-center shrink-0 mt-0.5">
        {task.dueDate ? (
          <button
            onClick={() => dateRef.current?.showPicker()}
            className={`text-xs font-[var(--font-ui)] transition-colors duration-[120ms] ${
              isOverdue(task.dueDate) && !task.completed
                ? "text-[var(--error-subtle)]"
                : "text-[var(--text-tertiary)]"
            }`}
          >
            {formatDate(task.dueDate)}
          </button>
        ) : (
          <button
            onClick={() => dateRef.current?.showPicker()}
            className="text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors duration-[120ms] opacity-0 group-hover:opacity-100 p-0.5"
            aria-label="Set due date"
          >
            <Calendar size={14} strokeWidth={1.75} />
          </button>
        )}
        <input
          ref={dateRef}
          type="date"
          className="sr-only"
          tabIndex={-1}
          value={toDateInputValue(task.dueDate)}
          onChange={(e) =>
            onUpdate(task.id, { dueDate: e.target.value || null })
          }
        />
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(task.id)}
        className="text-[var(--text-disabled)] hover:text-[var(--error)] transition-colors duration-[120ms] opacity-0 group-hover:opacity-100 p-0.5 shrink-0 mt-0.5"
        aria-label="Delete task"
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
