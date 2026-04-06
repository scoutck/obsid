"use client";

import { useState, useEffect, useCallback } from "react";
import type { Note } from "@/types";

interface PersonEntry {
  note: Note;
  meta: { aliases: string[]; role: string };
  noteCount: number;
}

interface UnresolvedEntry {
  name: string;
  noteIds: string[];
}

interface PeopleModalProps {
  onSelectNote: (note: Note) => void;
  onClose: () => void;
}

export default function PeopleModal({ onSelectNote, onClose }: PeopleModalProps) {
  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [unresolved, setUnresolved] = useState<UnresolvedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [peopleRes, notesRes] = await Promise.all([
      fetch("/api/people"),
      fetch("/api/notes"),
    ]);
    const peopleData: PersonEntry[] = await peopleRes.json();
    const notes: Note[] = await notesRes.json();

    // Unresolved people tracking moved to PendingPerson system in v1.2
    const unresolvedMap = new Map<string, string[]>();
    void notes; // notes fetched but unresolved aggregation now handled by PendingPerson

    setPeople(peopleData);
    setUnresolved(
      Array.from(unresolvedMap.entries()).map(([name, noteIds]) => ({
        name,
        noteIds,
      }))
    );
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleResolve = async (name: string, personNoteId: string, _noteIds: string[]) => {
    const person = people.find((p) => p.note.id === personNoteId);
    if (person) {
      const newAliases = [...new Set([...person.meta.aliases, name])];
      await fetch("/api/people", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: personNoteId, aliases: newAliases }),
      });
    }

    fetchData();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-zinc-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <h2 className="font-semibold text-zinc-900">People</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 text-sm"
          >
            Close
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-zinc-500 text-sm">
              Loading...
            </div>
          ) : (
            <>
              {unresolved.length > 0 && (
                <div className="px-4 py-2 border-b border-zinc-100">
                  <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
                    Unresolved ({unresolved.length})
                  </h3>
                  {unresolved.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm text-zinc-700">
                        {entry.name}{" "}
                        <span className="text-zinc-400">
                          ({entry.noteIds.length} notes)
                        </span>
                      </span>
                      <select
                        className="text-xs border border-zinc-200 rounded px-2 py-1"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleResolve(entry.name, e.target.value, entry.noteIds);
                          }
                        }}
                      >
                        <option value="" disabled>
                          Assign to...
                        </option>
                        {people.map((p) => (
                          <option key={p.note.id} value={p.note.id}>
                            {p.note.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 py-2">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  All People ({people.length})
                </h3>
                {people.length === 0 ? (
                  <p className="text-sm text-zinc-400 py-2">No people tracked yet.</p>
                ) : (
                  people.map((person) => (
                    <div
                      key={person.note.id}
                      className="flex items-center justify-between py-1.5 cursor-pointer hover:bg-zinc-50 -mx-2 px-2 rounded"
                      onClick={() => onSelectNote(person.note)}
                    >
                      <div>
                        <span className="text-sm font-medium text-zinc-800">
                          {person.note.title}
                        </span>
                        {person.meta.role && (
                          <span className="text-xs text-zinc-400 ml-2">
                            {person.meta.role}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-400">
                        {person.noteCount} notes
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
