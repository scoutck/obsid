"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface TagMenuProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (tag: string) => void;
  onClose: () => void;
}

interface TagEntry {
  tag: string;
  count: number;
}

export default function TagMenu({
  query,
  position,
  onSelect,
  onClose,
}: TagMenuProps) {
  const [tags, setTags] = useState<TagEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/tags")
      .then((res) => res.json())
      .then((data: TagEntry[]) => setTags(data));
  }, []);

  const filtered = tags.filter((t) =>
    t.tag.toLowerCase().includes(query.toLowerCase())
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filtered.length > 0) {
          onSelect(filtered[selectedIndex].tag);
        } else if (query) {
          onSelect(query);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, query, onSelect, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  useEffect(() => {
    const el = menuRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0 && !query) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-64 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-sm text-zinc-500">
          New tag: #{query}. Press Enter to create.
        </div>
      ) : (
        filtered.map((entry, i) => (
          <div
            key={entry.tag}
            className={`px-3 py-1.5 text-sm cursor-pointer flex justify-between ${
              i === selectedIndex ? "bg-indigo-50 text-indigo-700" : "text-zinc-700"
            }`}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => onSelect(entry.tag)}
          >
            <span>#{entry.tag}</span>
            <span className="text-zinc-400 text-xs">{entry.count}</span>
          </div>
        ))
      )}
    </div>
  );
}
