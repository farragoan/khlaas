/**
 * A scan "lease" lives in split_tables.raw_ocr (otherwise unused) while OCR is
 * running, because the status column's CHECK constraint has no "scanning"
 * value and adding one needs a migration. The lease expires, so a function
 * killed mid-OCR does not wedge the bill: after LEASE_MS another scan may start.
 */
export const LEASE_MS = 60_000;
const PREFIX = "scanning:";

export function leaseValue(now: number): string {
  return `${PREFIX}${now}`;
}

export function leaseIsLive(rawOcr: string | null | undefined, now: number): boolean {
  if (!rawOcr || !new RegExp(`^${PREFIX}\\d+$`).test(rawOcr)) return false;
  const started = Number(rawOcr.slice(PREFIX.length));
  return now - started < LEASE_MS;
}
