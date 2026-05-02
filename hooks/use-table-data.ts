"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Item, Participant, SplitTable, LedgerEntry, Payment } from "@/lib/db/schema";

export interface Selection {
  participantId: string;
  itemId: string;
}

// sessionToken is never returned by the API — omit it from the client-side type
export type PublicParticipant = Omit<Participant, "sessionToken"> & { upiId: string | null };

export interface TableData {
  table: SplitTable;
  items: Item[];
  participants: PublicParticipant[];
  selections: Selection[];
  payments: Payment[];
  ledger: LedgerEntry[];
}

const POLL_INTERVAL = 2000;

export function useTableData(shareCode: string) {
  const [data, setData] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables/${shareCode}`);
      if (!res.ok) {
        setError("Table not found");
        return;
      }
      const json: TableData = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Failed to load table");
    } finally {
      setLoading(false);
    }
  }, [shareCode]);

  useEffect(() => {
    fetch_();
    intervalRef.current = setInterval(fetch_, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch_]);

  return { data, error, loading, refresh: fetch_ };
}
