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
      if (!query) {
        // No query — list recent notes
        const res = await fetch("/api/notes");
        setResults(await res.json());
        setSelectedIndex(0);
        return;
      }

      // Try semantic search first
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, limit: 20 }),
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setSelectedIndex(0);
          return;
        }
      } catch {
        // Fall through to keyword search
      }

      // Fall back to keyword search
      const res = await fetch(`/api/notes?q=${encodeURIComponent(query)}`);
      setResults(await res.json());
      setSelectedIndex(0);
    }

    const timer = setTimeout(search, 200);  // Debounce for embedding API
    return () => clearTimeout(timer);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/20 animate-[modal-overlay-in_200ms_ease-out]">
      <div className="bg-white border border-zinc-200 rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-[modal-content-in_250ms_ease-out]">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-4 py-3 bg-transparent text-zinc-900 placeholder-zinc-400 outline-none border-b border-zinc-200"
        />
        <div className="max-h-64 overflow-y-auto">
          {results.map((note, i) => (
            <button
              key={note.id}
              className={`w-full text-left px-4 py-2 hover:bg-zinc-100 transition-colors duration-[120ms] ${
                i === selectedIndex ? "bg-zinc-100" : ""
              }`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => onSelect(note)}
            >
              <div className="text-sm text-zinc-800">
                {note.title || "Untitled"}
              </div>
              <div className="text-xs text-zinc-500 truncate">
                {note.content.slice(0, 80)}
              </div>
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-4 py-3 text-sm text-zinc-400">No notes found</div>
          )}
        </div>
      </div>
    </div>
  );
}
