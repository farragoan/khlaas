"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { SignInButton, UserButton, useAuth, useClerk } from "@clerk/nextjs";

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

const CURRENCY_OPTIONS = [
  { code: "INR", label: "₹ INR — Indian Rupee" },
  { code: "USD", label: "$ USD — US Dollar" },
  { code: "EUR", label: "€ EUR — Euro" },
  { code: "GBP", label: "£ GBP — British Pound" },
  { code: "AED", label: "د.إ AED — UAE Dirham" },
  { code: "SGD", label: "S$ SGD — Singapore Dollar" },
  { code: "JPY", label: "¥ JPY — Japanese Yen" },
  { code: "AUD", label: "A$ AUD — Australian Dollar" },
  { code: "CAD", label: "C$ CAD — Canadian Dollar" },
  { code: "BRL", label: "R$ BRL — Brazilian Real" },
  { code: "CNY", label: "¥ CNY — Chinese Yuan" },
];

function detectCurrency(): string {
  const lang = typeof navigator !== "undefined" ? navigator.language : "en-IN";
  return LOCALE_CURRENCY[lang] ?? LOCALE_CURRENCY[lang.split("-")[0]] ?? "INR";
}

export default function Home() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const [creating, setCreating] = useState(false);
  const [currency, setCurrency] = useState(() => detectCurrency());

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
        body: JSON.stringify({ currency }),
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

        <div className="w-full space-y-3">
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

          {/* Currency selector */}
          <div className="relative">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={creating}
              className="w-full h-10 bg-[var(--surface)] text-zinc-300 text-sm rounded-xl px-3 pr-8 appearance-none outline-none border border-zinc-800 focus:border-zinc-600 transition-colors disabled:opacity-50"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>
        </div>

        <p className="text-xs text-zinc-600">Free account needed · Works on any phone</p>
      </motion.div>
    </main>
  );
}
