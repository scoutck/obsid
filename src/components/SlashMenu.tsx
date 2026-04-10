"use client";

import { useState, useEffect, useRef } from "react";
import { filterCommands, type SlashCommand } from "@/editor/slash-commands";
import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconMap = icons as unknown as Record<string, LucideIcon>;

function CommandIcon({ name }: { name: string }) {
  const Icon = iconMap[name];
  if (!Icon) return null;
  return <Icon size={16} strokeWidth={1.75} className="text-zinc-400 shrink-0" />;
}

interface SlashMenuProps {
  query: string;
  position: { top: number; left: number };
  mode?: "notes" | "chat";
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export default function SlashMenu({
  query,
  position,
  mode,
  onSelect,
  onClose,
}: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const filtered = filterCommands(query, mode);

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
    const el = menuRef.current?.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  let currentCategory = "";

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-zinc-200 rounded-[10px] shadow-lg py-1 w-[280px] max-h-[360px] overflow-y-auto animate-[menu-in_150ms_ease-out]"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((cmd, i) => {
        const showCategory = cmd.category !== currentCategory;
        currentCategory = cmd.category;
        return (
          <div key={cmd.action}>
            {showCategory && (
              <div className="px-3 py-1.5 text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mt-1 first:mt-0">
                {cmd.category}
              </div>
            )}
            <button
              data-index={i}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-[var(--bg-subtle)] transition-colors duration-[120ms] ${
                i === selectedIndex ? "bg-[var(--bg-subtle)]" : ""
              }`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => onSelect(cmd)}
            >
              <CommandIcon name={cmd.icon} />
              <span className="text-sm text-zinc-800 flex-1">{cmd.label}</span>
              <span className="text-xs text-zinc-400">{cmd.description}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
