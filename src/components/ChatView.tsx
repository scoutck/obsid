"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage, Conversation } from "@/types";

interface ChatViewProps {
  conversation: Conversation;
  onSlashCommand?: (action: string) => void;
}

export default function ChatView({ conversation, onSlashCommand }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function loadMessages() {
      const res = await fetch(`/api/conversations/${conversation.id}/messages?limit=50`);
      const msgs: ChatMessage[] = await res.json();
      setMessages(msgs);
    }
    loadMessages();
  }, [conversation.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Check for slash commands
    if (text.startsWith("/")) {
      const action = text.slice(1).trim();
      onSlashCommand?.(action);
      setInput("");
      return;
    }

    setInput("");
    setIsLoading(true);

    // Optimistic add user message
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId: conversation.id,
      role: "user",
      content: text,
      toolCalls: [],
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          content: text,
        }),
      });

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: `temp-${Date.now()}-reply`,
        conversationId: conversation.id,
        role: "assistant",
        content: data.content,
        toolCalls: [],
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `temp-${Date.now()}-error`,
        conversationId: conversation.id,
        role: "assistant",
        content: "Something went wrong. Please try again.",
        toolCalls: [],
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, conversation.id, onSlashCommand]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-[720px] mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-zinc-400 text-sm py-12 font-[var(--font-body)]">
              Start typing to chat with Claude about your notes.
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id}>
              <div className={`text-xs mb-1 ${
                msg.role === "user" ? "text-zinc-400" : "text-[var(--ai-label)]"
              }`}>
                {msg.role === "user" ? "You" : "Claude"}
              </div>
              <div className={`text-sm whitespace-pre-wrap leading-relaxed font-[var(--font-body)] ${
                msg.role === "user"
                  ? "text-zinc-900"
                  : "text-zinc-700 bg-[var(--ai-bg)] border border-[var(--ai-border)] rounded-lg px-3 py-2.5"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div>
              <div className="text-xs text-[var(--ai-label)] mb-1">Claude</div>
              <div className="text-sm text-zinc-400 bg-[var(--ai-bg)] border border-[var(--ai-border)] rounded-lg px-3 py-2.5 animate-pulse font-[var(--font-body)]">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 px-4 py-3">
        <div className="max-w-[720px] mx-auto">
          <div className="border border-zinc-200 rounded-lg bg-white focus-within:border-indigo-300 transition-colors duration-[120ms] px-4 py-3 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-zinc-900 placeholder-zinc-400 outline-none text-sm leading-relaxed font-[var(--font-body)]"
            />
            {input.trim() && (
              <span className="text-xs text-zinc-400 shrink-0 pb-0.5">Enter to send</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
