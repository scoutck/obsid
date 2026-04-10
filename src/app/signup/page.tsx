"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, inviteCode }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Signup failed");
      setLoading(false);
      return;
    }

    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-900">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 p-8"
      >
        <h1 className="text-2xl font-bold text-zinc-50 font-[var(--font-body)]">Join Obsid</h1>
        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
        <input
          type="text"
          placeholder="Invite code"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors duration-[120ms]"
          autoFocus
        />
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors duration-[120ms]"
        />
        <input
          type="password"
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors duration-[120ms]"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-zinc-50 text-zinc-900 rounded-lg font-medium hover:bg-zinc-200 disabled:opacity-50 transition-colors duration-[120ms]"
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>
        <p className="text-zinc-500 text-sm text-center">
          Already have an account?{" "}
          <a href="/login" className="text-zinc-400 hover:text-zinc-200 transition-colors duration-[120ms]">
            Log in
          </a>
        </p>
      </form>
    </div>
  );
}
