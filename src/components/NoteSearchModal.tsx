"use client";

import { useState, useEffect, useRef } from "react";
import type { Note } from "@/types";

interface NoteSearchModalProps {
  onSelect: (note: Note) => void;
  onClose: () => void;
}

export default function NoteSearchModal({ onSelect, onClose }: NoteSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Note[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    async function search() {
      const url = query
        ? `/api/notes?q=${encodeURIComponent(query)}`
        : "/api/notes";
      const res = await fetch(url);
      const notes = await res.json();
      setResults(notes);
      setSelectedIndex(0);
    }
    search();
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      onSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-4 py-3 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none border-b border-zinc-700"
        />
        <div className="max-h-64 overflow-y-auto">
          {results.map((note, i) => (
            <button
              key={note.id}
              className={`w-full text-left px-4 py-2 hover:bg-zinc-800 ${
                i === selectedIndex ? "bg-zinc-800" : ""
              }`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => onSelect(note)}
            >
              <div className="text-sm text-zinc-100">
                {note.title || "Untitled"}
              </div>
              <div className="text-xs text-zinc-500 truncate">
                {note.content.slice(0, 80)}
              </div>
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-4 py-3 text-sm text-zinc-500">No notes found</div>
          )}
        </div>
      </div>
    </div>
  );
}
