/**
 * Poll cadence for the table view. Pure so the backoff can be tested: the
 * original hook re-created its fetch on every response, so the delay below was
 * never actually waited and the app polled back to back.
 */
export const MIN_INTERVAL = 2000;
export const MAX_INTERVAL = 10000;
export const ACTIVE_MAX_INTERVAL = 3000;
export const ERROR_MAX_INTERVAL = 15000;
const STEP = 1000;

export function nextInterval(
  current: number,
  opts: { changed: boolean; status: string | undefined; failed: boolean }
): number {
  if (opts.failed) return Math.min(Math.max(current, MIN_INTERVAL) * 2, ERROR_MAX_INTERVAL);
  if (opts.changed) return MIN_INTERVAL;
  const active = opts.status === "items_ready" || opts.status === "editing";
  return Math.min(current + STEP, active ? ACTIVE_MAX_INTERVAL : MAX_INTERVAL);
}

/** Cheap change detection across the fields the screens render. */
export function fingerprint(d: {
  table: { status: string; currency?: string; paymentMode?: string | null; actualPaidTotal?: string | null };
  participants: { id: string; displayName: string; splitsSubmittedAt?: unknown }[];
  items: { id: string }[];
  selections: { participantId: string; itemId: string; quantity: number }[];
  payments: { participantId: string; amount: string }[];
  ledger: { id?: string }[];
}): string {
  return JSON.stringify([
    d.table.status, d.table.currency, d.table.paymentMode, d.table.actualPaidTotal,
    d.participants.map((p) => [p.id, p.displayName, p.splitsSubmittedAt ? 1 : 0]),
    d.items.length,
    d.selections.map((s) => [s.participantId, s.itemId, s.quantity]),
    d.payments.map((p) => [p.participantId, p.amount]),
    d.ledger.length,
  ]);
}
