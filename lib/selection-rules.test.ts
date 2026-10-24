import { describe, it, expect } from "vitest";
import { availableUnits, fitsCapacity, isOverAllocated } from "./selection-rules";

describe("selection capacity", () => {
  it("accepts a claim that fits and rejects one that does not", () => {
    expect(fitsCapacity(3, 1, 2)).toBe(true);
    expect(fitsCapacity(3, 1, 3)).toBe(false);
  });
  it("never goes negative when others already over-claimed", () => {
    expect(availableUnits(2, 5)).toBe(0);
    expect(fitsCapacity(2, 5, 1)).toBe(false);
  });
  it("rejects zero, negative and fractional quantities", () => {
    expect(fitsCapacity(5, 0, 0)).toBe(false);
    expect(fitsCapacity(5, 0, -1)).toBe(false);
    expect(fitsCapacity(5, 0, 1.5)).toBe(false);
  });
  it("detects over-allocation only past the limit", () => {
    expect(isOverAllocated(2, 2)).toBe(false);
    expect(isOverAllocated(2, 3)).toBe(true);
  });
});
