"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Editor from "@/components/Editor";

export default function Home() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create a new note on first load
  useEffect(() => {
    async function init() {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const note = await res.json();
      setNoteId(note.id);
      setContent(note.content);
    }
    init();
  }, []);

  // Auto-save with debounce
  const handleChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      if (!noteId) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        const titleMatch = newContent.match(/^#\s+(.+)$/m);
        const title = titleMatch
          ? titleMatch[1]
          : newContent.split("\n")[0]?.slice(0, 100) || "";

        await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: newContent }),
        });
      }, 500);
    },
    [noteId]
  );

  if (!noteId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen">
      <Editor initialContent={content} onChange={handleChange} />
    </main>
  );
}
