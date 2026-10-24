"use client";

import { BASE } from "@/lib/base-path";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Item, Participant, SplitTable, LedgerEntry, Payment } from "@/lib/db/schema";
import { MIN_INTERVAL, fingerprint, nextInterval } from "./poll-interval";

export interface Selection {
  participantId: string;
  itemId: string;
  quantity: number;
}

export type PublicParticipant = Omit<Participant, "sessionToken"> & { upiId: string | null };

export interface TableData {
  table: Omit<SplitTable, "createdBy" | "rawOcr" | "receiptUrl">;
  items: Item[];
  participants: PublicParticipant[];
  selections: Selection[];
  payments: Payment[];
  ledger: LedgerEntry[];
  isHost: boolean;
  hostParticipantId: string | null;
}

export function useTableData(shareCode: string) {
  const [data, setData] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Everything the poll loop needs lives in refs so `fetch_` is stable. If it
  // depended on `data`, every response would rebuild it, re-run the effect and
  // fire the next request immediately, which defeated the backoff entirely.
  const dataRef = useRef<TableData | null>(null);
  const fingerprintRef = useRef<string | null>(null);
  const pollRef = useRef(MIN_INTERVAL);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const stoppedRef = useRef(false);

  const schedule = useCallback((fn: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (stoppedRef.current || (typeof document !== "undefined" && document.hidden)) return;
    timerRef.current = setTimeout(fn, pollRef.current);
  }, []);

  const fetch_ = useCallback(async () => {
    if (inFlightRef.current) return; // never overlap: out-of-order responses clobber newer data
    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    let failed = false;
    let changed = false;
    try {
      const headers: Record<string, string> = {};
      const tableId = dataRef.current?.table?.id;
      if (tableId) {
        const raw = localStorage.getItem(`khlaas:session:${tableId}`);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { sessionToken?: string };
            if (parsed.sessionToken) headers["x-session-token"] = parsed.sessionToken;
          } catch {
            // Corrupt stored session: poll anonymously rather than fail the poll.
          }
        }
      }
      const res = await fetch(`${BASE}/api/tables/${shareCode}`, { headers, signal: controller.signal, cache: "no-store" });
      if (!res.ok) {
        failed = true;
        // Only a missing table is "not found"; keep showing the last good data otherwise.
        setError(res.status === 404 ? "Table not found" : "Couldn't refresh");
        return;
      }
      const json: TableData = await res.json();
      const fp = fingerprint(json);
      changed = fp !== fingerprintRef.current;
      fingerprintRef.current = fp;
      dataRef.current = json;
      setData(json);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("table poll failed:", err);
      failed = true;
      setError("Failed to load table");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      if (!controller.signal.aborted) {
        pollRef.current = nextInterval(pollRef.current, {
          changed,
          status: dataRef.current?.table.status,
          failed,
        });
        schedule(fetch_);
      }
    }
  }, [shareCode, schedule]);

  useEffect(() => {
    stoppedRef.current = false;
    dataRef.current = null;
    fingerprintRef.current = null;
    pollRef.current = MIN_INTERVAL;
    fetch_();

    function handleVisibility() {
      if (document.hidden) {
        if (timerRef.current) clearTimeout(timerRef.current);
      } else {
        pollRef.current = MIN_INTERVAL;
        if (timerRef.current) clearTimeout(timerRef.current);
        fetch_();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      inFlightRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetch_]);

  // A failed refresh must not replace a bill the user is looking at: callers
  // only see an error when there is nothing to show.
  return { data, error: data ? null : error, stale: !!data && !!error, loading, refresh: fetch_ };
}
