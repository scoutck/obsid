"use client";

import { useState, useEffect, useCallback } from "react";

type SweepState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "thinking"; current: number; total: number; noteTitle: string }
  | { status: "done"; processed: number }
  | { status: "error"; message: string };

interface Expertise {
  topic: string;
  strength: "deep" | "moderate" | "emerging";
}

interface Pattern {
  label: string;
  description: string;
}

interface Profile {
  summary: string;
  expertise: Expertise[];
  patterns: Pattern[];
  thinkingStyle: string;
}

interface RawInsight {
  id: string;
  category: string;
  content: string;
  evidence: string;
  sourceNoteId: string | null;
  createdAt: string;
}

interface UserProfilePageProps {
  onSelectNote: (noteId: string) => void;
  onBack: () => void;
}

const strengthColors: Record<string, string> = {
  deep: "bg-indigo-100 text-indigo-700",
  moderate: "bg-blue-100 text-blue-700",
  emerging: "bg-zinc-100 text-zinc-600",
};

export default function UserProfilePage({ onSelectNote, onBack }: UserProfilePageProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [insights, setInsights] = useState<RawInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [synthesizing, setSynthesizing] = useState(false);
  const [sweep, setSweep] = useState<SweepState>({ status: "idle" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/user-insights");
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data: RawInsight[] = await res.json();
    setInsights(data);
    setLoading(false);

    if (data.length > 0) {
      setSynthesizing(true);
      const profileRes = await fetch("/api/ai/user-profile", { method: "POST" });
      if (profileRes.ok) {
        const p = await profileRes.json();
        if (!p.error) setProfile(p);
      }
      setSynthesizing(false);
    }
  }, []);

  const runSweep = useCallback(async () => {
    setSweep({ status: "loading" });

    let pending;
    try {
      const res = await fetch("/api/ai/think-sweep/pending");
      if (!res.ok) {
        setSweep({ status: "error", message: "Failed to fetch pending notes" });
        return;
      }
      pending = await res.json();
    } catch {
      setSweep({ status: "error", message: "Failed to fetch pending notes" });
      return;
    }

    if (pending.total === 0) {
      setSweep({ status: "done", processed: 0 });
      return;
    }

    let processed = 0;
    for (const note of pending.notes) {
      setSweep({
        status: "thinking",
        current: processed + 1,
        total: pending.total,
        noteTitle: note.title || "Untitled",
      });

      try {
        await fetch("/api/ai/think", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: note.id }),
        });
        processed++;
      } catch {
        console.error(`[think-sweep] Failed to process note ${note.id}`);
      }
    }

    setSweep({ status: "done", processed });
    fetchData();
  }, [fetchData]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-[720px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button onClick={onBack} className="text-xs text-zinc-400 hover:text-zinc-600 mb-2">
            &larr; Back
          </button>
          <h1 className="text-xl font-bold text-zinc-900">About You</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {insights.length} insight{insights.length !== 1 ? "s" : ""} collected
          </p>
          <div className="mt-3">
            {sweep.status === "idle" && (
              <button
                onClick={runSweep}
                className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Think
              </button>
            )}
            {sweep.status === "loading" && (
              <p className="text-xs text-zinc-400">Finding notes to analyze...</p>
            )}
            {sweep.status === "thinking" && (
              <div>
                <p className="text-xs text-zinc-500">
                  Thinking about &ldquo;{sweep.noteTitle}&rdquo;... {sweep.current} of {sweep.total}
                </p>
                <div className="mt-1 w-48 h-1 bg-zinc-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${(sweep.current / sweep.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {sweep.status === "done" && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-zinc-500">
                  {sweep.processed === 0
                    ? "All caught up \u2014 no new notes since last think"
                    : `Done \u2014 processed ${sweep.processed} note${sweep.processed !== 1 ? "s" : ""}`}
                </p>
                <button
                  onClick={() => setSweep({ status: "idle" })}
                  className="text-xs text-indigo-500 hover:text-indigo-700"
                >
                  Dismiss
                </button>
              </div>
            )}
            {sweep.status === "error" && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-red-500">{sweep.message}</p>
                <button
                  onClick={() => setSweep({ status: "idle" })}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>

        {insights.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-zinc-500">
              No insights yet. As you write notes, the AI will pick up on things you
              reveal about yourself — your habits, expertise, how you think.
            </p>
            <p className="text-xs text-zinc-400 mt-2">
              This page will populate automatically over time.
            </p>
          </div>
        ) : (
          <>
            {/* AI Summary */}
            {synthesizing ? (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Summary</h2>
                <p className="text-sm text-zinc-400">Synthesizing profile...</p>
              </div>
            ) : profile?.summary ? (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Summary</h2>
                <p className="text-sm text-zinc-700 leading-relaxed">{profile.summary}</p>
              </div>
            ) : null}

            {/* Expertise */}
            {profile?.expertise && profile.expertise.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Expertise</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.expertise.map((e) => (
                    <span
                      key={e.topic}
                      className={`text-xs px-2 py-1 rounded-full ${strengthColors[e.strength] ?? strengthColors.emerging}`}
                    >
                      {e.topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Patterns */}
            {profile?.patterns && profile.patterns.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Patterns</h2>
                <div className="space-y-2">
                  {profile.patterns.map((p) => (
                    <div key={p.label} className="text-sm">
                      <span className="font-medium text-zinc-800">{p.label}</span>
                      <span className="text-zinc-500"> — {p.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thinking Style */}
            {profile?.thinkingStyle && (
              <div className="mb-8">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Thinking Style</h2>
                <p className="text-sm text-zinc-700 leading-relaxed">{profile.thinkingStyle}</p>
              </div>
            )}

            {/* Recent Insights */}
            <div>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                Recent Insights
              </h2>
              <div className="space-y-3">
                {insights.slice(0, 20).map((insight) => (
                  <div key={insight.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded">
                        {insight.category}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {new Date(insight.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-zinc-700 mt-0.5">{insight.content}</p>
                    {insight.evidence && (
                      <p className="text-xs text-zinc-400 mt-0.5 italic">&ldquo;{insight.evidence}&rdquo;</p>
                    )}
                    {insight.sourceNoteId && (
                      <button
                        onClick={() => onSelectNote(insight.sourceNoteId!)}
                        className="text-xs text-indigo-500 hover:text-indigo-700 mt-0.5"
                      >
                        View source note
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
