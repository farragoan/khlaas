"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Item, Participant, SplitTable, LedgerEntry, Payment } from "@/lib/db/schema";

export interface Selection {
  participantId: string;
  itemId: string;
  quantity: number;
}

export type PublicParticipant = Omit<Participant, "sessionToken"> & { upiId: string | null };

export interface TableData {
  table: SplitTable;
  items: Item[];
  participants: PublicParticipant[];
  selections: Selection[];
  payments: Payment[];
  ledger: LedgerEntry[];
  isHost: boolean;
}

const MIN_INTERVAL = 2000;
const MAX_INTERVAL = 10000;
const STEP = 1000;

export function useTableData(shareCode: string) {
  const [data, setData] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef(MIN_INTERVAL);
  const lastUpdateRef = useRef(Date.now());

  const scheduleNext = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetch_, pollRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetch_ = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      const tableId = data?.table?.id;
      if (tableId) {
        const raw = localStorage.getItem(`khlaas:session:${tableId}`);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { sessionToken?: string };
            if (parsed.sessionToken) headers["x-session-token"] = parsed.sessionToken;
          } catch {}
        }
      }
      const res = await fetch(`/api/tables/${shareCode}`, { headers });
      if (!res.ok) {
        setError("Table not found");
        return;
      }
      const json: TableData = await res.json();
      const now = Date.now();
      const prevJson = data;
      const changed =
        !prevJson ||
        json.table.status !== prevJson.table.status ||
        json.participants.length !== prevJson.participants.length ||
        json.items.length !== prevJson.items.length ||
        json.selections.length !== prevJson.selections.length ||
        json.payments.length !== prevJson.payments.length ||
        json.ledger.length !== prevJson.ledger.length;

      if (changed) {
        pollRef.current = MIN_INTERVAL;
        lastUpdateRef.current = now;
      } else {
        // During active editing/items_ready, keep polling faster for real-time sync
        const isActiveEditing =
          json.table.status === "items_ready" || json.table.status === "editing";
        const maxInterval = isActiveEditing ? 3000 : MAX_INTERVAL;
        pollRef.current = Math.min(pollRef.current + STEP, maxInterval);
      }

      setData(json);
      setError(null);
    } catch {
      setError("Failed to load table");
    } finally {
      setLoading(false);
    }
  }, [shareCode, data]);

  useEffect(() => {
    fetch_();
    scheduleNext();

    function handleVisibility() {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        pollRef.current = MIN_INTERVAL;
        lastUpdateRef.current = Date.now();
        fetch_();
        scheduleNext();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetch_, scheduleNext]);

  return { data, error, loading, refresh: fetch_ };
}
