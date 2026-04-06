"use client";

import { useState, useEffect, useCallback } from "react";
import type { Note } from "@/types";

interface PersonEntry {
  note: Note;
  meta: { aliases: string[]; role: string };
  noteCount: number;
}

interface PeopleModalProps {
  onViewPerson: (personNoteId: string) => void;
  onClose: () => void;
}

export default function PeopleModal({ onViewPerson, onClose }: PeopleModalProps) {
  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const peopleRes = await fetch("/api/people");
    const peopleData: PersonEntry[] = await peopleRes.json();
    setPeople(peopleData);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);

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
                    onClick={() => onViewPerson(person.note.id)}
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
          )}
        </div>
      </div>
    </div>
  );
}
