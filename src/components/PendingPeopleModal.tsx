"use client";

import { useState, useEffect, useCallback } from "react";
import type { PendingPerson, Note, PersonMeta } from "@/types";

interface PersonEntry {
  note: Note;
  meta: PersonMeta;
}

interface PendingPeopleModalProps {
  onConfirm: (name: string) => void;  // Triggers NewPersonFlow pre-filled
  onClose: () => void;
}

export default function PendingPeopleModal({ onConfirm, onClose }: PendingPeopleModalProps) {
  const [pending, setPending] = useState<PendingPerson[]>([]);
  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [pendingRes, peopleRes] = await Promise.all([
      fetch("/api/pending-people"),
      fetch("/api/people"),
    ]);
    setPending(await pendingRes.json());
    setPeople(await peopleRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDismiss = async (id: string) => {
    await fetch("/api/pending-people", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "dismissed" }),
    });
    fetchData();
  };

  const handleMerge = async (pendingId: string, personNoteId: string, name: string) => {
    // Add name as alias to existing person
    const person = people.find((p) => p.note.id === personNoteId);
    if (person) {
      const newAliases = [...new Set([...person.meta.aliases, name])];
      await fetch("/api/people", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: personNoteId, aliases: newAliases }),
      });
    }

    // Mark pending as confirmed
    await fetch("/api/pending-people", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pendingId, status: "confirmed" }),
    });

    fetchData();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-zinc-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <h2 className="font-semibold text-zinc-900">Pending People</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-sm">
            Close
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">Loading...</div>
          ) : pending.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-400 text-sm">
              No pending people to review.
            </div>
          ) : (
            <div className="px-4 py-2">
              {pending.map((entry) => (
                <div key={entry.id} className="py-3 border-b border-zinc-50 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-zinc-800">{entry.name}</span>
                  </div>
                  {entry.context && (
                    <p className="text-xs text-zinc-500 mb-2 line-clamp-2">
                      &ldquo;{entry.context}&rdquo;
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onConfirm(entry.name);
                        fetch("/api/pending-people", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: entry.id, status: "confirmed" }),
                        });
                      }}
                      className="text-xs bg-zinc-900 text-white px-2 py-1 rounded hover:bg-zinc-800"
                    >
                      Confirm
                    </button>
                    <select
                      className="text-xs border border-zinc-200 rounded px-2 py-1"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleMerge(entry.id, e.target.value, entry.name);
                        }
                      }}
                    >
                      <option value="" disabled>Merge with...</option>
                      {people.map((p) => (
                        <option key={p.note.id} value={p.note.id}>{p.note.title}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDismiss(entry.id)}
                      className="text-xs text-zinc-400 hover:text-zinc-600 px-2 py-1"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
