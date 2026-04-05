"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Editor from "@/components/Editor";
import NoteSearchModal from "@/components/NoteSearchModal";
import { executeFormatting } from "@/editor/formatting";
import type { SlashCommand } from "@/editor/slash-commands";
import type { EditorView } from "@codemirror/view";
import type { Note } from "@/types";

export default function Home() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [showNoteSearch, setShowNoteSearch] = useState(false);
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

  const loadNote = useCallback(async (id: string) => {
    const res = await fetch(`/api/notes/${id}`);
    const note = await res.json();
    setNoteId(note.id);
    setContent(note.content);
  }, []);

  const handleSlashCommand = useCallback(
    (command: SlashCommand, view: EditorView) => {
      if (command.action.startsWith("format:")) {
        executeFormatting(view, command.action);
        return;
      }

      if (command.action === "note:new") {
        fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .then((res) => res.json())
          .then((note) => {
            setNoteId(note.id);
            setContent("");
          });
        return;
      }

      if (command.action === "note:open") {
        setShowNoteSearch(true);
        return;
      }

      if (command.action === "note:daily") {
        const today = new Date().toISOString().split("T")[0];
        const title = `Daily — ${today}`;
        fetch(`/api/notes?q=${encodeURIComponent(title)}`)
          .then((res) => res.json())
          .then((notes: Note[]) => {
            const existing = notes.find((n) => n.title === title);
            if (existing) {
              return loadNote(existing.id);
            }
            return fetch("/api/notes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                content: `# ${title}\n\n`,
                type: "daily",
              }),
            })
              .then((res) => res.json())
              .then((note) => {
                setNoteId(note.id);
                setContent(note.content);
              });
          });
        return;
      }

      console.log("Unhandled command:", command.action);
    },
    [loadNote]
  );

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
      <Editor
        key={noteId}
        initialContent={content}
        onChange={handleChange}
        onSlashCommand={handleSlashCommand}
      />
      {showNoteSearch && (
        <NoteSearchModal
          onSelect={(note) => {
            setShowNoteSearch(false);
            loadNote(note.id);
          }}
          onClose={() => setShowNoteSearch(false)}
        />
      )}
    </main>
  );
}
