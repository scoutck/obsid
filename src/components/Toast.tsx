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
    <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-100 text-sm shadow-lg">
      {message}
    </div>
  );
}
