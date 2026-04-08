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
