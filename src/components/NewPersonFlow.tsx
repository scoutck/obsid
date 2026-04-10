"use client";

import { useState, useRef, useEffect } from "react";

interface NewPersonFlowProps {
  prefillName?: string;
  onComplete: (person: { name: string; role: string; userContext: string }) => void;
  onCancel: () => void;
}

type Step = "name" | "role" | "context";

export default function NewPersonFlow({ prefillName, onComplete, onCancel }: NewPersonFlowProps) {
  const [step, setStep] = useState<Step>(prefillName ? "role" : "name");
  const [name, setName] = useState(prefillName ?? "");
  const [role, setRole] = useState("");
  const [userContext, setUserContext] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step === "context") {
      textareaRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [step]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      advance();
    }
  };

  const advance = () => {
    if (step === "name") {
      if (!name.trim()) return;
      setStep("role");
    } else if (step === "role") {
      setStep("context");
    } else if (step === "context") {
      onComplete({ name: name.trim(), role: role.trim(), userContext: userContext.trim() });
    }
  };

  const prompts: Record<Step, string> = {
    name: "Name?",
    role: "Role?",
    context: "Anything else about them?",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 animate-[modal-overlay-in_200ms_ease-out]">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-zinc-200 p-4 animate-[modal-content-in_250ms_ease-out]">
        <h2 className="text-sm font-semibold text-zinc-500 mb-3">New Person</h2>

        <div className="space-y-3">
          {step !== "name" && (
            <div className="text-sm text-zinc-700">
              <span className="text-zinc-400">Name:</span> {name}
            </div>
          )}
          {step === "context" && role && (
            <div className="text-sm text-zinc-700">
              <span className="text-zinc-400">Role:</span> {role}
            </div>
          )}

          <div>
            <label className="text-sm text-zinc-600 block mb-1">{prompts[step]}</label>
            {step === "context" ? (
              <textarea
                ref={textareaRef}
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Press Enter to skip"
                rows={3}
                className="w-full text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-300 resize-none"
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={step === "name" ? name : role}
                onChange={(e) => step === "name" ? setName(e.target.value) : setRole(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-300"
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600 px-3 py-1">
            Cancel
          </button>
          <button
            onClick={advance}
            className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800"
          >
            {step === "context" ? "Create" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
