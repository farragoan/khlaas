import { MAX_MONEY } from "@/lib/schemas";

/**
 * OCR output is model output: never trust its shape or its numbers. A negative
 * quantity shrinks the bill, 0.5 or null breaks the insert, 1e12 overflows
 * numeric(10,2) and loses the whole scan. Bad rows are dropped or clamped, not
 * allowed to fail the receipt.
 */
export const MAX_OCR_ITEMS = 100;
export const MAX_ITEM_QUANTITY = 99;
export const MAX_NAME_LENGTH = 100;

export interface CleanItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A finite money amount in (0, MAX_MONEY], or null. */
export function cleanAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > MAX_MONEY) return null;
  const r = round2(value);
  return r > 0 ? r : null;
}

export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

/** Returns null when `raw` is not an array at all (caller should 422). */
export function sanitizeOcrItems(raw: unknown): CleanItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CleanItem[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_OCR_ITEMS) break;
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = cleanName(e.name);
    if (!name) continue;

    let quantity = typeof e.quantity === "number" && Number.isFinite(e.quantity) ? Math.round(e.quantity) : 1;
    if (quantity < 0) continue; // a negative line would shrink the bill
    if (quantity === 0) quantity = 1;
    quantity = Math.min(quantity, MAX_ITEM_QUANTITY);

    // A free line (price 0) is legitimate; negative, null, huge or non-numeric is not.
    const price = e.unit_price;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > MAX_MONEY) continue;

    out.push({ name, quantity, unitPrice: round2(price) });
  }
  return out;
}
