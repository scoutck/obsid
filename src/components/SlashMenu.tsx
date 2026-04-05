"use client";

import { useState, useEffect, useRef } from "react";
import { filterCommands, type SlashCommand } from "@/editor/slash-commands";

interface SlashMenuProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export default function SlashMenu({
  query,
  position,
  onSelect,
  onClose,
}: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const filtered = filterCommands(query);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [filtered, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    const el = menuRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  let currentCategory = "";

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 w-64 max-h-72 overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((cmd, i) => {
        const showCategory = cmd.category !== currentCategory;
        currentCategory = cmd.category;
        return (
          <div key={cmd.action}>
            {showCategory && (
              <div className="px-3 py-1 text-xs text-zinc-500 font-medium uppercase tracking-wide">
                {cmd.category}
              </div>
            )}
            <button
              className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-zinc-100 ${
                i === selectedIndex ? "bg-zinc-100" : ""
              }`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => onSelect(cmd)}
            >
              <span className="text-sm text-zinc-800">{cmd.label}</span>
              <span className="text-xs text-zinc-500">{cmd.description}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
