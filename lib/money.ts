import { allocate, dinero, toSnapshot } from "dinero.js";

/**
 * Money is integer paise (minor units, exponent 2 — every amount column in the
 * schema is numeric(_,2)). Floats never carry money across a computation.
 * Rounding/splitting is delegated to dinero.js `allocate`, which is
 * largest-remainder exact: parts always sum to the whole.
 */
export type Paise = number;

const CURRENCY = { code: "XXX", base: 10, exponent: 2 } as const;
const DECIMAL = /^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/;

/**
 * Parse a NUMERIC string ("12.30") or a JS number into integer paise.
 * Strings are read digit-wise (no float round-trip). Numbers are rounded to
 * the nearest paisa. Anything that is not a finite decimal throws.
 */
export function toPaise(value: string | number): Paise {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`Not a finite amount: ${value}`);
    return Math.round(value * 100);
  }
  const m = DECIMAL.exec(value.trim());
  if (!m) throw new RangeError(`Not a decimal amount: ${JSON.stringify(value)}`);
  const [, sign, whole, frac = ""] = m;
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return sign === "-" ? -paise : paise;
}

/** Integer paise -> "12.30" for NUMERIC(_,2) columns. */
export function paiseToString(paise: Paise): string {
  const abs = Math.abs(paise);
  return `${paise < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Integer paise -> currency units for display/JSON. Exact to 2dp. */
export function paiseToUnits(paise: Paise): number {
  return paise / 100;
}

/**
 * Split `total` paise across `weights` (non-negative integers) so the parts sum
 * to `total` exactly. All-zero weights fall back to an equal split.
 */
export function splitPaise(total: Paise, weights: number[]): Paise[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const ratios = sum > 0 ? weights : weights.map(() => 1);
  return allocate(dinero({ amount: total, currency: CURRENCY }), ratios).map(
    (d) => toSnapshot(d).amount,
  );
}
