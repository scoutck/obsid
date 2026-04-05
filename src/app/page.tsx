"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Editor from "@/components/Editor";
import NoteSearchModal from "@/components/NoteSearchModal";
import TagInput from "@/components/TagInput";
import CollectionModal from "@/components/CollectionModal";
import PeopleModal from "@/components/PeopleModal";
import AiPrompt from "@/components/AiPrompt";
import AiResponseBlock from "@/components/AiResponseBlock";
import Toast from "@/components/Toast";
import { executeFormatting } from "@/editor/formatting";
import { extractWikiLinks } from "@/editor/wiki-links";
import { extractInlineTags } from "@/lib/extract-tags";
import type { SlashCommand } from "@/editor/slash-commands";
import type { EditorView } from "@codemirror/view";
import type { Note } from "@/types";

export default function Home() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const contentRef = useRef("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [showNoteSearch, setShowNoteSearch] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputPosition, setTagInputPosition] = useState({ top: 0, left: 0 });
  const [collectionModal, setCollectionModal] = useState<"open" | "new" | null>(null);
  const [showPeopleModal, setShowPeopleModal] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<{
    prompt: string;
    response: string;
    isLoading: boolean;
  } | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recentSiblingsRef = useRef<string[]>([]);

  // Load most recent note or create a welcome note on first launch
  useEffect(() => {
    async function init() {
      // Check for existing notes first
      const listRes = await fetch("/api/notes");
      const existingNotes = await listRes.json();

      if (existingNotes.length > 0) {
        // Open most recent note
        const latest = existingNotes[0];
        setNoteId(latest.id);
        setContent(latest.content);
        setNoteTags(latest.tags || []);
        return;
      }

      // Create welcome note
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Welcome to Obsid",
          content: "# Welcome to Obsid\n\nType `/` to open the command menu.\n\nTry creating a new note, adding tags, or asking Claude a question.\n",
          type: "welcome",
        }),
      });
      const note = await res.json();
      setNoteId(note.id);
      setContent(note.content);
    }
    init();
  }, []);

  const organizeNote = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/notes/${id}`);
        if (!res.ok) return null;
        const note = await res.json();

        const organizeRes = await fetch("/api/ai/organize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: id,
            title: note.title,
            content: note.content,
            recentSiblingIds: recentSiblingsRef.current.filter((sid) => sid !== id),
          }),
        });

        if (!organizeRes.ok) return null;
        return organizeRes.json();
      } catch {
        return null;
      }
    },
    []
  );

  const loadNote = useCallback(
    async (id: string) => {
      // Organize previous note in background (fire-and-forget)
      if (noteId && noteId !== id) {
        organizeNote(noteId);
      }

      const res = await fetch(`/api/notes/${id}`);
      const note = await res.json();
      setNoteId(note.id);
      setContent(note.content);
      setNoteTags(note.tags || []);

      // Track recent siblings
      recentSiblingsRef.current = [
        id,
        ...recentSiblingsRef.current.filter((sid) => sid !== id),
      ].slice(0, 5);
    },
    [noteId, organizeNote]
  );

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

      if (command.action === "ai:organize") {
        if (!noteId) return;
        setToast("Organizing...");
        organizeNote(noteId).then((result) => {
          if (result) {
            loadNote(noteId);
            const parts: string[] = [];
            if (result.tagsAdded?.length) parts.push(`${result.tagsAdded.length} tags`);
            if (result.linksAdded?.length) parts.push(`${result.linksAdded.length} links`);
            if (result.peopleResolved?.length) parts.push(`${result.peopleResolved.length} people`);
            setToast(parts.length > 0 ? `Added ${parts.join(", ")}` : "Already organized");
          } else {
            setToast("Organize failed");
          }
        });
        return;
      }

      if (command.action === "org:people") {
        setShowPeopleModal(true);
        return;
      }

      if (command.action === "ai:ask") {
        setShowAiPrompt(true);
        return;
      }

      console.log("Unhandled command:", command.action);
    },
    [loadNote, noteId, organizeNote]
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
      contentRef.current = newContent;
      if (!noteId) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        const titleMatch = newContent.match(/^#\s+(.+)$/m);
        const title = titleMatch
          ? titleMatch[1]
          : newContent.split("\n")[0]?.slice(0, 100) || "";

        const links = extractWikiLinks(newContent);
        const tags = extractInlineTags(newContent);

        await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: newContent, links, tags }),
        });
      }, 500);
    },
    [noteId]
  );

  const handleClaudeCommand = useCallback(
    async (instruction: string, cursorPosition: number) => {
      if (!noteId) return;

      const view = editorViewRef.current;
      if (!view) return;

      const doc = view.state.doc.toString();
      const lineAt = view.state.doc.lineAt(cursorPosition);

      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          noteId,
          noteContent: doc,
          noteTitle: doc.match(/^#\s+(.+)$/m)?.[1] ?? "",
          cursorPosition,
        }),
      });

      if (!res.ok) {
        const insertPos = lineAt.to;
        view.dispatch({
          changes: { from: insertPos, insert: "\n\u2717 command failed" },
        });
        return;
      }

      const { confirmation } = await res.json();
      const insertPos = lineAt.to;
      view.dispatch({
        changes: { from: insertPos, insert: `\n\u2713 ${confirmation}` },
      });
    },
    [noteId]
  );

  const handleAiSubmit = useCallback(
    async (prompt: string) => {
      setShowAiPrompt(false);
      setAiResponse({ prompt, response: "", isLoading: true });

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, currentNoteContent: contentRef.current }),
      });

      const text = await res.text();
      setAiResponse({ prompt, response: text, isLoading: false });
    },
    []
  );

  const handleAiKeep = useCallback(
    (text: string) => {
      const view = editorViewRef.current;
      if (view) {
        const pos = view.state.doc.length;
        view.dispatch({
          changes: { from: pos, insert: "\n\n" + text },
        });
        requestAnimationFrame(() => view.focus());
      }
      setAiResponse(null);
    },
    []
  );

  const handleAiDismiss = useCallback(() => {
    setAiResponse(null);
    requestAnimationFrame(() => editorViewRef.current?.focus());
  }, []);

  if (!noteId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Editor
          key={noteId}
          initialContent={content}
          onChange={handleChange}
          onSlashCommand={handleSlashCommand}
          onWikiLinkClick={handleWikiLinkClick}
          onClaudeCommand={handleClaudeCommand}
          editorViewRef={editorViewRef}
        />
      </div>

      <div className="max-w-[720px] mx-auto w-full px-4">
        {showAiPrompt && (
          <AiPrompt onSubmit={handleAiSubmit} onClose={() => setShowAiPrompt(false)} />
        )}
        {aiResponse && (
          <AiResponseBlock
            prompt={aiResponse.prompt}
            response={aiResponse.response}
            isLoading={aiResponse.isLoading}
            onKeep={handleAiKeep}
            onDismiss={handleAiDismiss}
          />
        )}
      </div>

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
      {showPeopleModal && (
        <PeopleModal
          onSelectNote={(note) => {
            setShowPeopleModal(false);
            loadNote(note.id);
          }}
          onClose={() => setShowPeopleModal(false)}
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
      {toast && (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      )}
    </main>
  );
}
