"use client";

import { useEffect, useCallback } from "react";

interface AiResponseBlockProps {
  prompt: string;
  response: string;
  isLoading: boolean;
  onKeep: (text: string) => void;
  onDismiss: () => void;
}

export default function AiResponseBlock({ prompt, response, isLoading, onKeep, onDismiss }: AiResponseBlockProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isLoading) return;
    if (!response) return;

    if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    } else if (e.key === "Enter") {
      e.preventDefault();
      onKeep(response);
    }
  }, [isLoading, response, onKeep, onDismiss]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="my-3 rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-indigo-600">Claude</span>
          <span className="text-xs text-zinc-400 truncate">{prompt}</span>
        </div>
        {!isLoading && response && (
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span>Enter to keep</span>
            <span>Esc to dismiss</span>
          </div>
        )}
      </div>
      <div className="px-4 py-3 text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
        {isLoading ? (
          <span className="text-zinc-400 animate-pulse">Thinking...</span>
        ) : (
          response
        )}
      </div>
    </div>
  );
}
