"use client";

interface AiResponseBlockProps {
  prompt: string;
  response: string;
  isLoading: boolean;
  onKeep: (text: string) => void;
  onDismiss: () => void;
}

export default function AiResponseBlock({ prompt, response, isLoading, onKeep, onDismiss }: AiResponseBlockProps) {
  return (
    <div className="my-3 rounded-lg border border-zinc-700 bg-zinc-900/80 overflow-hidden">
      <div className="px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-700 flex items-center gap-2">
        <span className="text-xs font-medium text-indigo-400">Claude</span>
        <span className="text-xs text-zinc-500 truncate">{prompt}</span>
      </div>
      <div className="px-3 py-2 text-sm text-zinc-200 whitespace-pre-wrap">
        {isLoading ? (
          <span className="text-zinc-500 animate-pulse">Thinking...</span>
        ) : (
          response
        )}
      </div>
      {!isLoading && response && (
        <div className="px-3 py-1.5 border-t border-zinc-700 flex gap-2 justify-end">
          <button onClick={onDismiss} className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300">
            Dismiss
          </button>
          <button onClick={() => onKeep(response)} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500">
            Keep
          </button>
        </div>
      )}
    </div>
  );
}
