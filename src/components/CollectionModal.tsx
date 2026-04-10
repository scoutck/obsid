"use client";

import { useState, useEffect, useRef } from "react";
import type { Collection, Note } from "@/types";

interface CollectionModalProps {
  mode: "open" | "new";
  onSelectNote: (note: Note) => void;
  onClose: () => void;
}

export default function CollectionModal({ mode, onSelectNote, onClose }: CollectionModalProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [name, setName] = useState("");
  const [filterTags, setFilterTags] = useState("");
  const [filterType, setFilterType] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (mode === "open") {
      fetch("/api/collections").then((r) => r.json()).then(setCollections);
    }
  }, [mode]);

  async function handleSelectCollection(col: Collection) {
    setSelectedCollection(col);
    const params = new URLSearchParams();
    if (col.filter.tags?.length) params.set("q", col.filter.tags.join(" "));
    if (col.filter.query) params.set("q", col.filter.query);
    const res = await fetch(`/api/notes?${params}`);
    setNotes(await res.json());
  }

  async function handleCreateCollection() {
    if (!name.trim()) return;
    const filter: Record<string, unknown> = {};
    if (filterTags.trim()) filter.tags = filterTags.split(",").map((t) => t.trim());
    if (filterType.trim()) filter.type = filterType.trim();
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), filter }),
    });
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/20 animate-[modal-overlay-in_200ms_ease-out]">
      <div className="bg-white border border-zinc-200 rounded-lg shadow-lg w-full max-w-md overflow-hidden animate-[modal-content-in_250ms_ease-out]" onKeyDown={handleKeyDown}>
        {mode === "new" ? (
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-medium text-zinc-700">New Collection</h3>
            <input ref={inputRef} type="text" placeholder="Collection name..." value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 text-zinc-900 text-sm rounded border border-zinc-300 outline-none focus:border-indigo-500" />
            <input type="text" placeholder="Filter by tags (comma separated)..." value={filterTags} onChange={(e) => setFilterTags(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 text-zinc-900 text-sm rounded border border-zinc-300 outline-none focus:border-indigo-500" />
            <input type="text" placeholder="Filter by type..." value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 text-zinc-900 text-sm rounded border border-zinc-300 outline-none focus:border-indigo-500" />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700">Cancel</button>
              <button onClick={handleCreateCollection} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-500">Create</button>
            </div>
          </div>
        ) : selectedCollection ? (
          <div>
            <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">{selectedCollection.name}</span>
              <button onClick={() => setSelectedCollection(null)} className="text-xs text-zinc-400 hover:text-zinc-600">Back</button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notes.map((note) => (
                <button key={note.id} className="w-full text-left px-4 py-2 hover:bg-zinc-100" onClick={() => onSelectNote(note)}>
                  <div className="text-sm text-zinc-800">{note.title || "Untitled"}</div>
                </button>
              ))}
              {notes.length === 0 && <div className="px-4 py-3 text-sm text-zinc-400">No notes in this collection</div>}
            </div>
          </div>
        ) : (
          <div>
            <div className="px-4 py-3 border-b border-zinc-200">
              <span className="text-sm font-medium text-zinc-700">Collections</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {collections.map((col) => (
                <button key={col.id} className="w-full text-left px-4 py-2 hover:bg-zinc-100" onClick={() => handleSelectCollection(col)}>
                  <div className="text-sm text-zinc-800">{col.name}</div>
                </button>
              ))}
              {collections.length === 0 && <div className="px-4 py-3 text-sm text-zinc-400">No collections yet</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
