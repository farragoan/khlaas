"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton, useClerk } from "@clerk/nextjs";
import { Loader2, Clock, Check, Users, Camera, ArrowLeft } from "lucide-react";
import { getCurrencySymbol } from "@/lib/currency-context";
import type { HistoryBillEntry } from "@/app/api/history/route";

const STATUS_CONFIG: Record<
  HistoryBillEntry["status"],
  { label: string; className: string }
> = {
  active: {
    label: "Open",
    className: "bg-zinc-800 text-zinc-300",
  },
  items_ready: {
    label: "Selecting",
    className: "bg-amber-900/30 text-amber-400",
  },
  editing: {
    label: "Editing",
    className: "bg-amber-900/30 text-amber-400",
  },
  settled: {
    label: "Settled",
    className: "bg-emerald-900/30 text-emerald-400",
  },
  expired: {
    label: "Expired",
    className: "bg-red-900/30 text-red-400",
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export default function HistoryPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const { openSignIn } = useClerk();
  const router = useRouter();
  const [bills, setBills] = useState<HistoryBillEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (pageCursor: string | null, append: boolean) => {
      const url = pageCursor
        ? `/api/history?cursor=${encodeURIComponent(pageCursor)}`
        : "/api/history";

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch history");
      const data = await res.json();

      setBills((prev) => (append ? [...prev, ...data.bills] : data.bills));
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor != null);
    },
    []
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setLoading(true);
    setError(null);
    fetchPage(null, false)
      .catch(() => setError("Couldn't load your bills. Please try again."))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, fetchPage]);

  function handleLoadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    fetchPage(cursor, true)
      .catch(() => setError("Couldn't load more bills."))
      .finally(() => setLoadingMore(false));
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0F0F0F]">
        <Loader2 className="animate-spin text-zinc-600" size={32} />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0F0F0F] px-6 text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
          <Clock size={28} className="text-zinc-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-white font-semibold text-lg">Sign in to see your bill history</h1>
          <p className="text-zinc-500 text-sm">Your past bills appear here once you&apos;re signed in.</p>
        </div>
        <SignInButton mode="modal">
          <button className="px-6 py-3 bg-[var(--brand)] text-black font-semibold rounded-2xl text-sm">
            Sign in
          </button>
        </SignInButton>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-[#0F0F0F] flex flex-col max-w-lg mx-auto px-4">
      {/* Header */}
      <div className="flex items-center gap-3 py-5">
        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          className="text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-white font-semibold text-lg">Bill History</h1>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-zinc-600" size={28} />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchPage(null, false)
                .catch(() => setError("Couldn't load your bills."))
                .finally(() => setLoading(false));
            }}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : bills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
            <Camera size={28} className="text-zinc-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-white font-semibold text-lg">No bills yet</h2>
            <p className="text-zinc-500 text-sm">
              Scan your first receipt to get started.
            </p>
          </div>
          <Link
            href="/"
            className="mt-2 px-6 py-3 bg-[var(--brand)] text-black font-semibold rounded-2xl text-sm"
          >
            Scan a bill
          </Link>
        </div>
      ) : (
        <div className="space-y-3 pb-8">
          {bills.map((bill) => {
            const statusConfig = STATUS_CONFIG[bill.status];
            return (
              <Link
                key={bill.shareCode}
                href={`/t/${bill.shareCode}`}
                className="block bg-[var(--surface)] rounded-2xl px-4 py-4 hover:bg-zinc-800/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}
                      >
                        {statusConfig.label}
                      </span>
                      {bill.role === "creator" && (
                        <span className="text-xs text-zinc-600">Created</span>
                      )}
                      {bill.role === "both" && (
                        <span className="text-xs text-zinc-600">Created</span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400">
                      {formatDate(bill.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white font-semibold text-sm">
                      {getCurrencySymbol(bill.currency)}
                      {bill.billTotal.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {bill.participantCount} {bill.participantCount === 1 ? "person" : "people"}
                  </span>
                  <span>
                    {bill.itemCount} {bill.itemCount === 1 ? "item" : "items"}
                  </span>
                  {bill.myDisplayName && (
                    <span className="text-zinc-600">
                      as {bill.myDisplayName}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Load more"
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
