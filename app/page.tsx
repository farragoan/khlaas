"use client";

import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { SignInButton, UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useState } from "react";

const LOCALE_CURRENCY: Record<string, string> = {
  "en-IN": "INR", "hi-IN": "INR", "hi": "INR",
  "en-US": "USD", "en-CA": "CAD",
  "en-GB": "GBP",
  "en-AU": "AUD", "en-NZ": "NZD",
  "en-SG": "SGD", "zh-SG": "SGD",
  "en-AE": "AED", "ar-AE": "AED",
  "ja": "JPY", "ja-JP": "JPY",
  "zh-CN": "CNY", "zh": "CNY",
  "ko": "KRW", "ko-KR": "KRW",
  "fr": "EUR", "de": "EUR", "es": "EUR", "it": "EUR", "nl": "EUR", "pt-PT": "EUR",
  "pt-BR": "BRL",
};

function detectCurrency(): string {
  const lang = typeof navigator !== "undefined" ? navigator.language : "en-IN";
  return LOCALE_CURRENCY[lang] ?? LOCALE_CURRENCY[lang.split("-")[0]] ?? "INR";
}

export default function Home() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const [creating, setCreating] = useState(false);

  async function handleStart() {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: detectCurrency() }),
      });
      const { shareCode } = await res.json();
      router.push(`/t/${shareCode}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-dvh px-6 bg-[#0F0F0F]">
      {/* Auth bar */}
      <div className="fixed top-4 right-4 z-10">
        {isSignedIn ? (
          <UserButton appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
        ) : (
          <SignInButton mode="modal">
            <button className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-600">
              Sign in
            </button>
          </SignInButton>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center text-center gap-8 max-w-xs w-full"
      >
        <div>
          <h1 className="text-5xl font-bold tracking-tight text-[var(--brand)]">खल्लास</h1>
          <p className="text-zinc-400 text-sm mt-2">Split bills, not friendships</p>
        </div>

        <div className="w-full">
          <button
            onClick={handleStart}
            disabled={creating}
            className="w-full h-16 bg-[var(--brand)] hover:bg-amber-300 active:scale-95 text-black font-semibold text-lg rounded-2xl flex items-center justify-center gap-2.5 transition-all disabled:opacity-60"
          >
            {creating ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <>
                <Camera size={22} />
                {isSignedIn ? "Scan a bill" : "Sign in to scan a bill"}
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-zinc-600">Free account needed · Works on any phone</p>
      </motion.div>
    </main>
  );
}
