import { describe, it, expect } from "vitest";
import { sanitizeOcrItems, cleanAmount, MAX_OCR_ITEMS } from "./ocr-sanitize";

describe("sanitizeOcrItems", () => {
  it("rejects a non-array so the route can 422", () => {
    expect(sanitizeOcrItems(undefined)).toBeNull();
    expect(sanitizeOcrItems(null)).toBeNull();
    expect(sanitizeOcrItems({})).toBeNull();
  });

  it("keeps a normal line and rounds the price to paise", () => {
    expect(sanitizeOcrItems([{ name: " Dosa ", quantity: 2, unit_price: 80.456 }])).toEqual([
      { name: "Dosa", quantity: 2, unitPrice: 80.46 },
    ]);
  });

  it("drops negative quantity or price, null/NaN/huge price, and blank names", () => {
    const out = sanitizeOcrItems([
      { name: "neg qty", quantity: -1, unit_price: 10 },
      { name: "neg price", quantity: 1, unit_price: -10 },
      { name: "null price", quantity: 1, unit_price: null },
      { name: "huge", quantity: 1, unit_price: 1e12 },
      { name: "str", quantity: 1, unit_price: "10" },
      { name: "  ", quantity: 1, unit_price: 10 },
      null,
      { name: "ok", quantity: 1, unit_price: 5 },
    ]);
    expect(out).toEqual([{ name: "ok", quantity: 1, unitPrice: 5 }]);
  });

  it("repairs quantity: zero, fractional, missing and absurd", () => {
    const [a, b, c, d] = sanitizeOcrItems([
      { name: "a", quantity: 0, unit_price: 1 },
      { name: "b", quantity: 2.4, unit_price: 1 },
      { name: "c", unit_price: 1 },
      { name: "d", quantity: 5000, unit_price: 1 },
    ])!;
    expect([a.quantity, b.quantity, c.quantity, d.quantity]).toEqual([1, 2, 1, 99]);
  });

  it("keeps a genuinely free line", () => {
    expect(sanitizeOcrItems([{ name: "water", quantity: 1, unit_price: 0 }])).toHaveLength(1);
  });

  it("caps the item count", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ name: `i${i}`, quantity: 1, unit_price: 1 }));
    expect(sanitizeOcrItems(many)).toHaveLength(MAX_OCR_ITEMS);
  });
});

describe("cleanAmount", () => {
  it("accepts real fees and rejects zero, negative, NaN, Infinity, huge and non-numbers", () => {
    expect(cleanAmount(12.345)).toBe(12.35);
    for (const bad of [0, -5, NaN, Infinity, 1e12, "5", null, undefined]) expect(cleanAmount(bad)).toBeNull();
  });
});
