"use client";

import { useState, useRef, useEffect } from "react";

interface TagInputProps {
  existingTags: string[];
  onSubmit: (tag: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export default function TagInput({ existingTags, onSubmit, onClose, position }: TagInputProps) {
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
    <div
      className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-2 w-56"
      style={{ top: position.top, left: position.left }}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="Add tag..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onClose}
        className="w-full px-2 py-1 bg-zinc-800 text-zinc-100 text-sm rounded border border-zinc-600 outline-none focus:border-indigo-500"
      />
      {existingTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {existingTags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-400 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
