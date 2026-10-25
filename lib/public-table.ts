import type { SplitTable } from "@/lib/db/schema";

/** Columns of split_tables that never leave the server through the read endpoint. */
type Hidden = "rawOcr" | "receiptUrl";
export type PublicSplitTable = Omit<SplitTable, Hidden>;

/**
 * The share link is a bearer secret handed to anyone, so the read endpoint
 * must not leak more than a guest needs: raw OCR text and the receipt image
 * URL are never returned, and payment addresses (upiId) are shown only to
 * people who are themselves at the table.
 */
export function toPublicTable(table: SplitTable): PublicSplitTable {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawOcr, receiptUrl, ...rest } = table;
  return rest;
}

export function redactParticipants<P extends { upiId: string | null }>(
  participants: P[],
  viewerIsParticipant: boolean
): P[] {
  return viewerIsParticipant ? participants : participants.map((p) => ({ ...p, upiId: null }));
}
