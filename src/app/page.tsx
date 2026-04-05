"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Editor from "@/components/Editor";
import NoteSearchModal from "@/components/NoteSearchModal";
import TagInput from "@/components/TagInput";
import CollectionModal from "@/components/CollectionModal";
import { executeFormatting } from "@/editor/formatting";
import { extractWikiLinks } from "@/editor/wiki-links";
import type { SlashCommand } from "@/editor/slash-commands";
import type { EditorView } from "@codemirror/view";
import type { Note } from "@/types";

export default function Home() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [showNoteSearch, setShowNoteSearch] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputPosition, setTagInputPosition] = useState({ top: 0, left: 0 });
  const [collectionModal, setCollectionModal] = useState<"open" | "new" | null>(null);
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
    setNoteTags(note.tags || []);
  }, []);

  const handleWikiLinkClick = useCallback(
    async (title: string) => {
      const res = await fetch(`/api/notes?q=${encodeURIComponent(title)}`);
      const notes: Note[] = await res.json();
      const match = notes.find(
        (n) => n.title.toLowerCase() === title.toLowerCase()
      );
      if (match) {
        loadNote(match.id);
      } else {
        const createRes = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: `# ${title}\n\n` }),
        });
        const newNote = await createRes.json();
        setNoteId(newNote.id);
        setContent(newNote.content);
      }
    },
    [loadNote]
  );

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

      if (command.action === "org:wiki-link") {
        const pos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: pos, insert: "[[]]" },
          selection: { anchor: pos + 2 },
        });
        return;
      }

      if (command.action === "org:tag") {
        const coords = view.coordsAtPos(view.state.selection.main.head);
        setTagInputPosition({
          top: coords ? coords.bottom + 8 : 200,
          left: coords ? coords.left : 200,
        });
        setShowTagInput(true);
        return;
      }

      if (command.action === "org:search") {
        setShowNoteSearch(true);
        return;
      }

      if (command.action === "org:open-collection") {
        setCollectionModal("open");
        return;
      }

      if (command.action === "org:new-collection") {
        setCollectionModal("new");
        return;
      }

      console.log("Unhandled command:", command.action);
    },
    [loadNote]
  );

  const handleAddTag = useCallback(
    async (tag: string) => {
      setShowTagInput(false);
      if (!noteId) return;
      const updated = [...noteTags, tag];
      setNoteTags(updated);
      await fetch(`/api/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updated }),
      });
    },
    [noteId, noteTags]
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

        const links = extractWikiLinks(newContent);

        await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: newContent, links }),
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
        onWikiLinkClick={handleWikiLinkClick}
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
      {showTagInput && (
        <TagInput
          existingTags={noteTags}
          onSubmit={handleAddTag}
          onClose={() => setShowTagInput(false)}
          position={tagInputPosition}
        />
      )}
      {collectionModal && (
        <CollectionModal
          mode={collectionModal}
          onSelectNote={(note) => {
            setCollectionModal(null);
            loadNote(note.id);
          }}
          onClose={() => setCollectionModal(null)}
        />
      )}
    </main>
  );
}
