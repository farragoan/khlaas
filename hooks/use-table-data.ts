"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Item, Participant, SplitTable, LedgerEntry } from "@/lib/db/schema";

export interface Selection {
  participantId: string;
  itemId: string;
}

export interface TableData {
  table: SplitTable;
  items: Item[];
  participants: Participant[];
  selections: Selection[];
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

      // Stop polling once settled
      if (json.table.status === "settled" && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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
