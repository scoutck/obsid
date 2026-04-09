"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Editor from "@/components/Editor";
import Toast from "@/components/Toast";
import dynamic from "next/dynamic";

const NoteSearchModal = dynamic(() => import("@/components/NoteSearchModal"));
const TagInput = dynamic(() => import("@/components/TagInput"));
const CollectionModal = dynamic(() => import("@/components/CollectionModal"));
const PeopleModal = dynamic(() => import("@/components/PeopleModal"));
const AiPrompt = dynamic(() => import("@/components/AiPrompt"));
const AiResponseBlock = dynamic(() => import("@/components/AiResponseBlock"));
const ChatView = dynamic(() => import("@/components/ChatView"), {
  loading: () => <div className="flex items-center justify-center h-full"><p className="text-zinc-500">Loading...</p></div>,
});
const PersonPage = dynamic(() => import("@/components/PersonPage"), {
  loading: () => <div className="flex items-center justify-center h-full"><p className="text-zinc-500">Loading...</p></div>,
});
const NewPersonFlow = dynamic(() => import("@/components/NewPersonFlow"));
const PendingPeopleModal = dynamic(() => import("@/components/PendingPeopleModal"));
const TaskInput = dynamic(() => import("@/components/TaskInput"));
const TaskModal = dynamic(() => import("@/components/TaskModal"));
const UserProfilePage = dynamic(() => import("@/components/UserProfilePage"), {
  loading: () => <div className="flex items-center justify-center h-full"><p className="text-zinc-500">Loading...</p></div>,
});
import { executeFormatting } from "@/editor/formatting";
import { extractWikiLinks } from "@/editor/wiki-links";
import { extractInlineTags } from "@/lib/extract-tags";
import { updateCommandEffect } from "@/editor/command-widgets";
import type { SlashCommand } from "@/editor/slash-commands";
import type { EditorView } from "@codemirror/view";
import type { Note, CommandData, Conversation } from "@/types";

export default function Home() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const contentRef = useRef("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [noteCommands, setNoteCommands] = useState<CommandData[]>([]);
  const [showNoteSearch, setShowNoteSearch] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputPosition, setTagInputPosition] = useState({ top: 0, left: 0 });
  const [collectionModal, setCollectionModal] = useState<"open" | "new" | null>(null);
  const [showPeopleModal, setShowPeopleModal] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mode, setMode] = useState<"notes" | "chat">("notes");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [showNewPerson, setShowNewPerson] = useState(false);
  const [newPersonPrefill, setNewPersonPrefill] = useState<string | undefined>();
  const [showPendingPeople, setShowPendingPeople] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [personPageId, setPersonPageId] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<{
    prompt: string;
    response: string;
    isLoading: boolean;
  } | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recentSiblingsRef = useRef<string[]>([]);
  const organizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const organizeInFlightRef = useRef<Set<string>>(new Set());

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
        contentRef.current = latest.content;
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
      contentRef.current = note.content;
    }
    init();
  }, []);

  const organizeNote = useCallback(
    async (id: string) => {
      // Deduplication: skip if already in-flight for this note
      if (organizeInFlightRef.current.has(id)) return null;
      organizeInFlightRef.current.add(id);

      try {
        const organizeRes = await fetch("/api/ai/organize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: id,
            recentSiblingIds: recentSiblingsRef.current.filter((sid) => sid !== id),
          }),
        });

        if (!organizeRes.ok) return null;
        return organizeRes.json();
      } catch {
        return null;
      } finally {
        organizeInFlightRef.current.delete(id);
      }
    },
    []
  );

  const loadNote = useCallback(
    async (id: string) => {
      // Cancel any pending debounced organize from previous navigation
      if (organizeTimeoutRef.current) {
        clearTimeout(organizeTimeoutRef.current);
        organizeTimeoutRef.current = null;
      }

      // Organize previous note in background with 2s debounce
      if (noteId && noteId !== id) {
        const prevId = noteId;
        organizeTimeoutRef.current = setTimeout(() => {
          organizeNote(prevId);
        }, 2000);
      }

      const [noteRes, cmdsRes] = await Promise.all([
        fetch(`/api/notes/${id}`),
        fetch(`/api/notes/${id}/commands`),
      ]);
      if (!noteRes.ok) return;
      const note = await noteRes.json();
      if (!note.id || note.error) return;
      const cmds: CommandData[] = cmdsRes.ok ? await cmdsRes.json() : [];
      setNoteId(note.id);
      setContent(note.content);
      contentRef.current = note.content;
      setNoteTags(note.tags || []);
      setNoteCommands(cmds);

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
        contentRef.current = newNote.content;
      }
    },
    [loadNote]
  );

  const handleSlashCommand = useCallback(
    (command: SlashCommand, view: EditorView) => {
      if (command.action === "app:logout") {
        fetch("/api/auth/logout", { method: "POST" }).then(() => {
          window.location.href = "/login";
        });
        return;
      }

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
            contentRef.current = "";
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
                contentRef.current = note.content;
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
        // Cancel pending auto-save so it doesn't bump updatedAt while
        // the organize endpoint is processing (causes stale detection).
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        setToast("Organizing...");
        organizeNote(noteId).then((result) => {
          if (!result) {
            setToast("Organize failed");
            return;
          }
          if (result.stale) {
            setToast("Note changed — organize skipped");
            return;
          }
          loadNote(noteId);
          const parts: string[] = [];
          if (result.linksAdded?.length) parts.push(`${result.linksAdded.length} links`);
          if (result.peopleResolved?.length) parts.push(`${result.peopleResolved.length} people`);
          if (result.pendingPeople?.length) parts.push(`${result.pendingPeople.length} pending`);
          setToast(parts.length > 0 ? `Added ${parts.join(", ")}` : "Already organized");
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

      if (command.action === "mode:chat") {
        fetch("/api/conversations")
          .then((res) => res.json())
          .then(async (conv) => {
            if (!conv) {
              const createRes = await fetch("/api/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              });
              conv = await createRes.json();
            }
            setConversation(conv);
            setMode("chat");
          });
        return;
      }

      if (command.action === "mode:notes") {
        setMode("notes");
        return;
      }

      if (command.action === "mode:new-chat") {
        fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .then((res) => res.json())
          .then((conv) => setConversation(conv));
        return;
      }

      if (command.action === "org:new-person") {
        setShowNewPerson(true);
        return;
      }

      if (command.action === "org:pending-people") {
        setShowPendingPeople(true);
        return;
      }

      if (command.action === "ai:claude") {
        const pos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: pos, insert: "/claude " },
          selection: { anchor: pos + 8 },
        });
        view.focus();
        return;
      }

      if (command.action === "ai:think") {
        if (!noteId) return;
        // Cancel pending auto-save and flush current content so /think
        // reasons about the latest version, not a stale DB snapshot.
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        const currentContent = contentRef.current;
        const titleMatch = currentContent.match(/^#\s+(.+)$/m);
        const title = titleMatch
          ? titleMatch[1]
          : currentContent.split("\n")[0]?.slice(0, 100) || "";
        const links = extractWikiLinks(currentContent);
        const tags = extractInlineTags(currentContent);
        setToast("Thinking deeply...");
        fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: currentContent, links, tags }),
        })
          .then(() => fetch("/api/ai/think", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ noteId }),
          }))
          .then(async (res) => {
            if (!res.ok) {
              setToast("Think failed");
              return;
            }
            const result = await res.json();
            if (result.connectionsAdded) {
              loadNote(noteId);
              const parts: string[] = [];
              if (result.connections) parts.push("connections found");
              if (result.insightsAdded > 0)
                parts.push(`${result.insightsAdded} insights`);
              setToast(parts.join(", ") || "No connections found");
            } else {
              setToast("No connections found");
            }
          })
          .catch(() => setToast("Think failed"));
        return;
      }

      if (command.action === "task:create") {
        setShowTaskInput(true);
        return;
      }

      if (command.action === "task:list") {
        setShowTaskModal(true);
        return;
      }

      if (command.action === "profile:me") {
        setShowProfile(true);
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

  const handleCreateTask = useCallback(
    (title: string) => {
      setShowTaskInput(false);
      fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, noteId: noteId ?? undefined }),
      })
        .then((res) => {
          setToast(res.ok ? "Task created" : "Failed to create task");
        })
        .catch(() => setToast("Failed to create task"));
    },
    [noteId]
  );

  // Auto-save with debounce
  const handleChange = useCallback(
    (newContent: string) => {
      contentRef.current = newContent;
      if (!noteId) return;

      // Never overwrite a note with empty content — guard against edge-case
      // races (e.g. editor remount with stale state) that could blank a note.
      if (!newContent.trim()) return;

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
    async (instruction: string, commandId: string, line: number) => {
      if (!noteId) return;

      const view = editorViewRef.current;
      if (!view) return;

      const doc = view.state.doc.toString();
      const safeLineNum = Math.min(line, view.state.doc.lines);
      const cursorPosition = view.state.doc.line(safeLineNum).from;

      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          noteId,
          noteContent: doc,
          noteTitle: doc.match(/^#\s+(.+)$/m)?.[1] ?? "",
          cursorPosition,
          line,
        }),
      });

      if (!res.ok) {
        view.dispatch({
          effects: updateCommandEffect.of({
            id: commandId,
            confirmation: "command failed",
            status: "error",
          }),
        });
        return;
      }

      const result = await res.json();
      view.dispatch({
        effects: updateCommandEffect.of({
          id: commandId,
          confirmation: result.confirmation,
          status: "done",
        }),
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

  const handleNewPersonComplete = useCallback(
    async (data: { name: string; role: string; userContext: string }) => {
      setShowNewPerson(false);
      setNewPersonPrefill(undefined);

      const res = await fetch("/api/people/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          role: data.role,
          userContext: data.userContext,
        }),
      });
      const person = await res.json();

      if (data.userContext) {
        fetch("/api/ai/person-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personNoteId: person.note.id }),
        }).catch(() => {});
      }

      setToast(`Added ${data.name}`);
    },
    []
  );

  const handleChatSlashCommand = useCallback(
    (action: string) => {
      if (action === "notemode" || action === "mode:notes") {
        setMode("notes");
      } else if (action === "newchat" || action === "mode:new-chat") {
        fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .then((res) => res.json())
          .then((conv) => setConversation(conv));
      } else if (action === "people" || action === "org:people") {
        setShowPeopleModal(true);
      } else if (action === "newperson" || action === "org:new-person") {
        setShowNewPerson(true);
      } else if (action === "pendingpeople" || action === "org:pending-people") {
        setShowPendingPeople(true);
      } else if (action === "newnote" || action === "note:new") {
        fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .then((res) => res.json())
          .then((note) => {
            setNoteId(note.id);
            setContent("");
            contentRef.current = "";
            setMode("notes");
          });
      } else if (action === "opennote" || action === "note:open") {
        setShowNoteSearch(true);
      } else if (action === "app:logout") {
        fetch("/api/auth/logout", { method: "POST" }).then(() => {
          window.location.href = "/login";
        });
      } else if (action === "task" || action === "task:create") {
        setShowTaskInput(true);
      } else if (action === "tasks" || action === "task:list") {
        setShowTaskModal(true);
      } else if (action === "me" || action === "profile:me") {
        setShowProfile(true);
      }
    },
    []
  );

  if (!noteId && mode === "notes") {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen flex flex-col">
      {/* Mode indicator */}
      {mode === "chat" && (
        <div className="flex items-center justify-center py-1">
          <span className="text-xs text-zinc-300">chat</span>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {showProfile ? (
          <UserProfilePage
            onSelectNote={(id) => {
              setShowProfile(false);
              loadNote(id);
            }}
            onBack={() => setShowProfile(false)}
          />
        ) : personPageId ? (
          <PersonPage
            personNoteId={personPageId}
            onSelectNote={(id) => {
              setPersonPageId(null);
              loadNote(id);
            }}
            onBack={() => setPersonPageId(null)}
          />
        ) : mode === "chat" && conversation ? (
          <ChatView
            conversation={conversation}
            onSlashCommand={handleChatSlashCommand}
          />
        ) : (
          <Editor
            key={noteId ?? "empty"}
            initialContent={contentRef.current}
            initialCommands={noteCommands}
            mode={mode}
            onChange={handleChange}
            onSlashCommand={handleSlashCommand}
            onWikiLinkClick={handleWikiLinkClick}
            onClaudeCommand={handleClaudeCommand}
            editorViewRef={editorViewRef}
          />
        )}
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
          onViewPerson={(personNoteId) => {
            setShowPeopleModal(false);
            setPersonPageId(personNoteId);
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

      {showNewPerson && (
        <NewPersonFlow
          prefillName={newPersonPrefill}
          onComplete={handleNewPersonComplete}
          onCancel={() => {
            setShowNewPerson(false);
            setNewPersonPrefill(undefined);
          }}
        />
      )}

      {showPendingPeople && (
        <PendingPeopleModal
          onConfirm={(name) => {
            setShowPendingPeople(false);
            setNewPersonPrefill(name);
            setShowNewPerson(true);
          }}
          onClose={() => setShowPendingPeople(false)}
        />
      )}
      {showTaskInput && (
        <TaskInput
          onSubmit={handleCreateTask}
          onClose={() => setShowTaskInput(false)}
        />
      )}
      {showTaskModal && (
        <TaskModal
          onNavigateToNote={(id) => {
            setShowTaskModal(false);
            loadNote(id);
          }}
          onClose={() => setShowTaskModal(false)}
        />
      )}
    </main>
  );
}
