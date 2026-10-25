import { describe, it, expect } from "vitest";
import { toPaise, paiseToString, paiseToUnits, splitPaise } from "./money";

describe("toPaise", () => {
  it("reads NUMERIC strings digit-wise with no float error", () => {
    expect(toPaise("0.10")).toBe(10);
    expect(toPaise("0.29")).toBe(29);
    expect(toPaise("1.005")).toBe(100); // third decimal truncated, never float-rounded
    expect(toPaise("100")).toBe(10000);
    expect(toPaise("12.3")).toBe(1230);
    expect(toPaise("-4.50")).toBe(-450);
    expect(toPaise(" 7.00 ")).toBe(700);
  });
  it("rounds numbers to the nearest paisa", () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(1.15)).toBe(115);
  });
  it("rejects non-decimals", () => {
    expect(() => toPaise("abc")).toThrow(RangeError);
    expect(() => toPaise("1e3")).toThrow(RangeError);
    expect(() => toPaise("")).toThrow(RangeError);
    expect(() => toPaise(NaN)).toThrow(RangeError);
    expect(() => toPaise(Infinity)).toThrow(RangeError);
  });
});

describe("paiseToString / paiseToUnits", () => {
  it("formats exactly", () => {
    expect(paiseToString(0)).toBe("0.00");
    expect(paiseToString(5)).toBe("0.05");
    expect(paiseToString(1230)).toBe("12.30");
    expect(paiseToString(-450)).toBe("-4.50");
    expect(paiseToUnits(1999)).toBe(19.99);
  });
  it("round-trips with toPaise", () => {
    for (const n of [0, 1, 9, 10, 99, 100, 101, 123456, 99999999]) {
      expect(toPaise(paiseToString(n))).toBe(n);
    }
  });
});

describe("splitPaise", () => {
  it("always sums to the total (largest remainder, no lost paisa)", () => {
    expect(splitPaise(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(splitPaise(100, [1, 1, 1]).sort()).toEqual([33, 33, 34]);
    expect(splitPaise(1, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(1);
  });
  it("is proportional", () => {
    expect(splitPaise(30000, [100, 200])).toEqual([10000, 20000]);
  });
  it("falls back to an equal split when every weight is zero", () => {
    expect(splitPaise(100, [0, 0])).toEqual([50, 50]);
  });
  it("gives a zero-weight party nothing when others have weight", () => {
    expect(splitPaise(5, [0, 3])).toEqual([0, 5]);
  });
  it("handles empty weights and zero totals", () => {
    expect(splitPaise(10, [])).toEqual([]);
    expect(splitPaise(0, [1, 2])).toEqual([0, 0]);
  });
});
