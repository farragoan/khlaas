/**
 * Pure capacity rules for item claims. An item with quantity N can be claimed
 * by participants in total up to N units; nothing in the DB enforces that
 * (see docs/migrations-pending.md), so the routes check it with these.
 */
export function availableUnits(itemQuantity: number, allocatedByOthers: number): number {
  return Math.max(0, itemQuantity - allocatedByOthers);
}

export function fitsCapacity(itemQuantity: number, allocatedByOthers: number, requested: number): boolean {
  return Number.isInteger(requested) && requested >= 1 && requested <= availableUnits(itemQuantity, allocatedByOthers);
}

/** True when the sum of all claims on an item exceeds what exists. */
export function isOverAllocated(itemQuantity: number, totalAllocated: number): boolean {
  return totalAllocated > itemQuantity;
}
