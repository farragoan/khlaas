import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a user-typed number string that may use locale-specific decimal separators.
 * In some locales (e.g. France, Germany) a comma is the decimal point ("12,50").
 * In others (e.g. US) a comma is the thousands separator ("1,234.56").
 * We infer intent from the position of the last separator character.
 */
export function parseLocalizedNumber(value: string): number {
  if (!value || value.trim() === "") return 0;
  const s = value.trim();

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Both present — whichever is last is the decimal separator
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      // e.g. "1.234,56" → European format
      return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    }
    // e.g. "1,234.56" → US format
    return parseFloat(s.replace(/,/g, "")) || 0;
  }

  if (hasComma && !hasDot) {
    const parts = s.split(",");
    // "12,50" → 2 parts, last part ≤ 2 digits → decimal
    // "1,234" or "1,234,567" → thousands separator
    if (parts.length === 2 && parts[1].length <= 2) {
      return parseFloat(s.replace(",", ".")) || 0;
    }
    return parseFloat(s.replace(/,/g, "")) || 0;
  }

  return parseFloat(s) || 0;
}
