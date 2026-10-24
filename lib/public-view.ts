import type { SplitTable } from "@/lib/db/schema";

/**
 * What GET /api/tables/[shareCode] may reveal. The share code is a link anyone
 * can forward, so the response is limited to what the screens need.
 */

/** Table row without the creator's Clerk id, the raw OCR dump and receipt URL. */
export function publicTable(table: SplitTable): Omit<SplitTable, "createdBy" | "rawOcr" | "receiptUrl"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdBy, rawOcr, receiptUrl, ...rest } = table;
  return rest;
}

interface ParticipantRow {
  id: string;
  tableId: string;
  displayName: string;
  userId: string | null;
  sessionToken: string | null;
  upiId: string | null;
  joinedAt: Date | null;
  splitsSubmittedAt: Date | null;
}

/**
 * - sessionToken is never returned.
 * - userId is returned only on the viewer's own row (the UI uses it to know the
 *   viewer is signed in); other people's Clerk ids stay server-side.
 * - upiId is returned to the host, to the owner, and to participants once the
 *   bill reaches the pay-out phase (needed to pay each other); never to a
 *   stranger with just the link.
 */
export function publicParticipant(
  p: ParticipantRow,
  ctx: { isMe: boolean; isHost: boolean; viewerIsParticipant: boolean; payOut: boolean }
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sessionToken, userId, upiId, ...rest } = p;
  const showUpi = ctx.isMe || ctx.isHost || (ctx.viewerIsParticipant && ctx.payOut);
  return {
    ...rest,
    userId: ctx.isMe ? userId : null,
    upiId: showUpi ? upiId : null,
  };
}
