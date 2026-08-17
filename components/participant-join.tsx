"use client";

import { useState, useEffect } from "react";
import { nanoid } from "nanoid";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { GoogleOneTap, useUser, useClerk } from "@clerk/nextjs";
import { AUTH_MODAL_PROPS } from "@/lib/auth-ui";
import type { Session } from "@/hooks/use-session";

interface ParticipantJoinProps {
  tableId: string;
  onJoined: (session: Session) => void;
}

export function ParticipantJoin({ tableId, onJoined }: ParticipantJoinProps) {
  const { user, isSignedIn } = useUser();
  const { openSignIn } = useClerk();
  const [name, setName] = useState(() =>
    isSignedIn ? (user?.fullName ?? user?.firstName ?? "") : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuestForm, setShowGuestForm] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      fetch("/api/user-profile")
        .then((res) => res.json())
        .then((profile) => {
          if (profile?.displayName && !name) {
            setName(profile.displayName);
          }
        })
        .catch(() => {});
    }
  }, [isSignedIn]);

  const displayName = isSignedIn
    ? (user?.fullName ?? user?.firstName ?? "")
    : name;

  async function handleJoin() {
    const trimmed = displayName.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    const sessionToken = nanoid(32);

    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId, displayName: trimmed, sessionToken }),
      });

      if (!res.ok) throw new Error("Failed to join");

      const { participantId } = await res.json();

      if (isSignedIn) {
        fetch("/api/user-profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: trimmed }),
        }).catch(() => {});
      }

      onJoined({ participantId, displayName: trimmed, sessionToken, tableId });
    } catch {
      setError("Couldn't join. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (isSignedIn) {
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
            <p className="text-sm text-zinc-400 mt-1">
              Joining as {displayName}
            </p>
          </div>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <Button
            onClick={handleJoin}
            disabled={loading}
            className="w-full h-12 bg-[var(--brand)] hover:bg-amber-300 text-black font-semibold rounded-xl"
          >
            {loading ? "Joining…" : `Join as ${displayName}`}
          </Button>
        </motion.div>
      </div>
    );
  }

  if (!showGuestForm) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 20 }}
          className="w-full max-w-sm bg-[var(--surface)] rounded-2xl p-6 space-y-5"
        >
          {/* Reached only when signed out, so One Tap always has work to do:
              a returning user joins without leaving the share link. */}
          <GoogleOneTap />

          <div>
            <h2 className="text-xl font-semibold text-white">Join the table</h2>
            <p className="text-sm text-zinc-400 mt-1">Choose how to join</p>
          </div>

          <Button
            onClick={() => openSignIn(AUTH_MODAL_PROPS)}
            className="w-full h-12 bg-[var(--brand)] hover:bg-amber-300 text-black font-semibold rounded-xl"
          >
            Continue with Google
          </Button>

          <Button
            onClick={() => setShowGuestForm(true)}
            variant="outline"
            className="w-full h-12 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-semibold rounded-xl"
          >
            Continue as guest
          </Button>
        </motion.div>
      </div>
    );
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

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <Button
          onClick={handleJoin}
          disabled={!name.trim() || loading}
          className="w-full h-12 bg-[var(--brand)] hover:bg-amber-300 text-black font-semibold rounded-xl"
        >
          {loading ? "Joining…" : "Join table"}
        </Button>

        <div className="text-center">
          <button
            onClick={() => setShowGuestForm(false)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
          >
            Sign in instead to save your bill history
          </button>
        </div>
      </motion.div>
    </div>
  );
}
