"use client";

import { useEffect } from "react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
  duration?: number;
}

export default function Toast({
  message,
  onDismiss,
  duration = 3000,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div className="fixed bottom-5 right-5 z-50 px-4 py-2 rounded-[10px] bg-zinc-800 text-zinc-100 text-sm shadow-lg animate-[toast-in_200ms_ease-out]">
      {message}
    </div>
  );
}
