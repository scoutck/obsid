"use client";

interface StatusBarProps {
  noteTitle: string;
  saveStatus: "saved" | "saving" | "unsaved";
}

export default function StatusBar({ noteTitle, saveStatus }: StatusBarProps) {
  const statusText = {
    saved: "Saved",
    saving: "Saving...",
    unsaved: "Unsaved",
  }[saveStatus];

  return (
    <div className="h-8 flex items-center justify-between px-4 border-b border-[var(--border-subtle)]">
      <div className="max-w-[720px] mx-auto w-full flex items-center justify-between">
        <span className="text-xs text-zinc-400 truncate max-w-[50%]">
          {noteTitle || "Untitled"}
        </span>
        <span className={`text-xs ${saveStatus === "saving" ? "text-zinc-400" : "text-zinc-300"}`}>
          {statusText}
        </span>
      </div>
    </div>
  );
}
