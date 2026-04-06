"use client";

import { useState, useEffect, useCallback } from "react";
import type { Note, PersonMeta } from "@/types";

interface ConnectedNote {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  highlight: string;
}

interface PersonPageProps {
  personNoteId: string;
  onSelectNote: (noteId: string) => void;
  onBack: () => void;
}

export default function PersonPage({ personNoteId, onSelectNote, onBack }: PersonPageProps) {
  const [person, setPerson] = useState<{ note: Note; meta: PersonMeta } | null>(null);
  const [connectedNotes, setConnectedNotes] = useState<ConnectedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/people/${personNoteId}`);
    const data = await res.json();
    setPerson(data.person);
    setConnectedNotes(data.connectedNotes);
    setSummaryDraft(data.person.meta.summary);
    setLoading(false);
  }, [personNoteId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveSummary = async () => {
    if (!person) return;
    await fetch("/api/people", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noteId: personNoteId,
        summary: summaryDraft,
      }),
    });
    setPerson({
      ...person,
      meta: { ...person.meta, summary: summaryDraft },
    });
    setEditingSummary(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!person) return null;

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-[720px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={onBack} className="text-xs text-zinc-400 hover:text-zinc-600 mb-2">
            &larr; Back to people
          </button>
          <h1 className="text-xl font-bold text-zinc-900">{person.note.title}</h1>
          {person.meta.role && (
            <p className="text-sm text-zinc-500 mt-1">{person.meta.role}</p>
          )}
        </div>

        {/* AI Summary */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Summary</h2>
            <button
              onClick={() => {
                if (editingSummary) saveSummary();
                else setEditingSummary(true);
              }}
              className="text-xs text-indigo-500 hover:text-indigo-700"
            >
              {editingSummary ? "Save" : "Edit"}
            </button>
          </div>
          {editingSummary ? (
            <textarea
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              className="w-full text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-lg p-3 outline-none focus:border-indigo-300 resize-none"
              rows={4}
            />
          ) : (
            <p className="text-sm text-zinc-700 leading-relaxed">
              {person.meta.summary || "No summary yet — it will be generated as notes are linked."}
            </p>
          )}
        </div>

        {/* Connected Notes */}
        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Connected Notes ({connectedNotes.length})
          </h2>
          {connectedNotes.length === 0 ? (
            <p className="text-sm text-zinc-400">No notes linked yet.</p>
          ) : (
            <div className="space-y-3">
              {connectedNotes.map((note) => (
                <div
                  key={note.id}
                  className="cursor-pointer hover:bg-zinc-50 -mx-2 px-2 py-2 rounded"
                  onClick={() => onSelectNote(note.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-800">{note.title || "Untitled"}</span>
                    <span className="text-xs text-zinc-400">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{note.highlight}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
