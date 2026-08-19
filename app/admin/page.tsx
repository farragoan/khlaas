"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { AUTH_MODAL_PROPS } from "@/lib/auth-ui";
import type { HealthCheck, HealthStatus } from "@/lib/health/checks";

interface HealthResponse {
  status: HealthStatus;
  checks: HealthCheck[];
  deployedCommitRef: string | null;
  checkedAt: string;
}

interface ForbiddenResponse {
  error: string;
  yourUserId: string | null;
  configured: boolean;
}

const STATUS_STYLE: Record<HealthStatus, { dot: string; chip: string; label: string }> = {
  ok: { dot: "bg-emerald-400", chip: "bg-emerald-900/30 text-emerald-400", label: "OK" },
  warn: { dot: "bg-amber-400", chip: "bg-amber-900/30 text-amber-400", label: "Warning" },
  fail: { dot: "bg-red-400", chip: "bg-red-900/30 text-red-400", label: "Failing" },
};

const HEADLINE: Record<HealthStatus, string> = {
  ok: "Everything is being watched",
  warn: "Something needs a look",
  fail: "Something is broken right now",
};

function CheckRow({ check }: { check: HealthCheck }) {
  const style = STATUS_STYLE[check.status];
  return (
    <div className="bg-[var(--surface)] rounded-xl px-4 py-3.5 space-y-2">
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} aria-hidden />
        <span className="text-sm font-medium text-zinc-100 flex-1 min-w-0">{check.label}</span>
        <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${style.chip}`}>
          {style.label}
        </span>
        <span className="text-[11px] text-zinc-600 tabular-nums w-12 text-right">
          {check.durationMs}ms
        </span>
      </div>

      <p className="text-xs text-zinc-400 pl-[18px]">{check.summary}</p>

      {check.remedy && (
        <p className="text-xs text-amber-400/80 pl-[18px]">{check.remedy}</p>
      )}

      {check.detail && (
        <pre className="pl-[18px] text-[11px] text-zinc-600 overflow-x-auto">
          {Object.entries(check.detail)
            .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
            .join("\n")}
        </pre>
      )}
    </div>
  );
}

/**
 * The point of this page is to answer one question without asking a human to
 * go looking: is anything watching, and is anything broken? It deliberately
 * shows a failing check's remedy inline — a dashboard that only reports colour
 * makes you go find out what red means.
 */
export default function AdminPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [data, setData] = useState<HealthResponse | null>(null);
  const [forbidden, setForbidden] = useState<ForbiddenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health");
      const json = await res.json();
      if (res.status === 403) {
        setForbidden(json as ForbiddenResponse);
        setData(null);
      } else if (!res.ok) {
        setError(json.error ?? "Health check failed");
      } else {
        setData(json as HealthResponse);
        setForbidden(null);
      }
    } catch {
      setError("Couldn't reach the health endpoint.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) load();
  }, [isLoaded, isSignedIn, load]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0F0F0F]">
        <Loader2 className="animate-spin text-zinc-600" size={32} />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0F0F0F] px-6 text-center gap-5">
        <h1 className="text-white font-semibold text-lg">Admin</h1>
        <p className="text-zinc-500 text-sm">Sign in to see system health.</p>
        <SignInButton mode="modal" {...AUTH_MODAL_PROPS}>
          <button className="px-6 py-3 bg-[var(--brand)] text-black font-semibold rounded-2xl text-sm">
            Continue with Google
          </button>
        </SignInButton>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-[#0F0F0F] flex flex-col max-w-lg mx-auto px-4 pb-10">
      <div className="flex items-center gap-3 py-5">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-white font-semibold text-lg flex-1">System health</h1>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Re-run
        </button>
      </div>

      {forbidden && (
        <div className="bg-[var(--surface)] rounded-2xl px-4 py-4 space-y-3">
          <p className="text-sm font-medium text-zinc-100">
            {forbidden.configured ? "You're not on the admin allowlist" : "No admin is configured yet"}
          </p>
          <p className="text-xs text-zinc-400">
            Access is an explicit allowlist, and an unset one lets nobody in. Add
            your own Clerk ID to grant yourself access:
          </p>
          <pre className="text-[11px] text-zinc-300 bg-black/40 rounded-lg p-3 overflow-x-auto">
{`netlify env:set ADMIN_USER_IDS "${forbidden.yourUserId ?? "<your-clerk-id>"}"`}
          </pre>
          <p className="text-[11px] text-zinc-600">
            Comma-separate to add more. Redeploy for it to take effect.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-400 py-4">{error}</p>}

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-zinc-600" size={28} />
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 px-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${STATUS_STYLE[data.status].dot}`}
              aria-hidden
            />
            <p className="text-sm text-zinc-200 font-medium">{HEADLINE[data.status]}</p>
          </div>

          <div className="space-y-2.5">
            {data.checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </div>

          <p className="text-[11px] text-zinc-600 px-1 pt-2">
            Checked {new Date(data.checkedAt).toLocaleTimeString()}
            {data.deployedCommitRef && ` · deployed ${data.deployedCommitRef.slice(0, 8)}`}
          </p>
        </div>
      )}
    </main>
  );
}
