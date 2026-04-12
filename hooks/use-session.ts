"use client";

import { useEffect, useState } from "react";

export interface Session {
  participantId: string;
  displayName: string;
  sessionToken: string;
  tableId: string;
}

function sessionKey(tableId: string) {
  return `khlaas:session:${tableId}`;
}

export function useSession(tableId: string | null) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!tableId) return;
    const raw = localStorage.getItem(sessionKey(tableId));
    if (raw) {
      try {
        setSession(JSON.parse(raw) as Session);
      } catch {
        localStorage.removeItem(sessionKey(tableId));
      }
    }
  }, [tableId]);

  function saveSession(s: Session) {
    localStorage.setItem(sessionKey(s.tableId), JSON.stringify(s));
    setSession(s);
  }

  function clearSession() {
    if (!tableId) return;
    localStorage.removeItem(sessionKey(tableId));
    setSession(null);
  }

  return { session, saveSession, clearSession };
}
