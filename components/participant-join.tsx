"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SignInButton, useUser } from "@clerk/nextjs";
import type { Session } from "@/hooks/use-session";

interface ParticipantJoinProps {
  tableId: string;
  onJoined: (session: Session) => void;
}

export function ParticipantJoin({ tableId, onJoined }: ParticipantJoinProps) {
  const { user, isSignedIn } = useUser();
  const [name, setName] = useState(() =>
    isSignedIn ? (user?.fullName ?? user?.firstName ?? "") : ""
  );
  const [upiId, setUpiId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    const sessionToken = nanoid(32);

    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId, displayName: trimmed, sessionToken, upiId: upiId.trim() || undefined }),
      });

      if (!res.ok) throw new Error("Failed to join");

      const { participantId } = await res.json();
      onJoined({ participantId, displayName: trimmed, sessionToken, tableId });
    } catch {
      setError("Couldn't join. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 20 }}
        className="w-full max-w-sm bg-[var(--surface)] rounded-2xl p-6 space-y-5"
      >
        <div>
          <h2 className="text-xl font-semibold text-white">Join the table</h2>
          <p className="text-sm text-zinc-400 mt-1">Enter your name so others know who you are</p>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="Your name"
          maxLength={50}
          autoFocus
          className="w-full bg-[var(--surface-raised)] text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[var(--brand)]"
        />

        <input
          type="text"
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="UPI ID (optional, e.g. name@bank)"
          maxLength={50}
          className="w-full bg-[var(--surface-raised)] text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[var(--brand)]"
        />

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <Button
          onClick={handleJoin}
          disabled={!name.trim() || loading}
          className="w-full h-12 bg-[var(--brand)] hover:bg-amber-300 text-black font-semibold rounded-xl"
        >
          {loading ? "Joining…" : "Join table"}
        </Button>

        {!isSignedIn && (
          <div className="text-center">
            <SignInButton mode="modal">
              <button className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2">
                Sign in instead to save your bill history
              </button>
            </SignInButton>
          </div>
        )}
      </motion.div>
    </div>
  );
}
