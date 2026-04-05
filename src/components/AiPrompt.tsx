"use client";

import { useState, useRef, useEffect } from "react";

interface AiPromptProps {
  onSubmit: (prompt: string) => void;
  onClose: () => void;
}

export default function AiPrompt({ onSubmit, onClose }: AiPromptProps) {
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
    <div className="my-2 flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-indigo-500/50 rounded-lg">
      <span className="text-indigo-400 text-sm font-medium">Claude</span>
      <input
        ref={inputRef}
        type="text"
        placeholder="Ask anything about your notes..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onClose}
        className="flex-1 bg-transparent text-zinc-100 text-sm outline-none placeholder-zinc-500"
      />
      <span className="text-xs text-zinc-600">Enter to send</span>
    </div>
  );
}
