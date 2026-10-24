import { describe, it, expect } from "vitest";
import { nextInterval, MIN_INTERVAL, MAX_INTERVAL, ACTIVE_MAX_INTERVAL, ERROR_MAX_INTERVAL, fingerprint } from "./poll-interval";

const ok = { changed: false, status: "active", failed: false };

describe("nextInterval", () => {
  it("backs off one step per unchanged poll up to the max", () => {
    let i = MIN_INTERVAL;
    for (let n = 0; n < 20; n++) i = nextInterval(i, ok);
    expect(i).toBe(MAX_INTERVAL);
    expect(nextInterval(MIN_INTERVAL, ok)).toBeGreaterThan(MIN_INTERVAL);
  });
  it("resets to the minimum when something changed", () => {
    expect(nextInterval(9000, { ...ok, changed: true })).toBe(MIN_INTERVAL);
  });
  it("polls faster while editing", () => {
    expect(nextInterval(9000, { ...ok, status: "editing" })).toBe(ACTIVE_MAX_INTERVAL);
  });
  it("doubles on failure, capped", () => {
    expect(nextInterval(2000, { ...ok, failed: true })).toBe(4000);
    expect(nextInterval(MAX_INTERVAL, { ...ok, failed: true })).toBe(ERROR_MAX_INTERVAL);
  });
});

describe("fingerprint", () => {
  const base = {
    table: { status: "active" }, participants: [{ id: "p", displayName: "A" }], items: [{ id: "i" }],
    selections: [{ participantId: "p", itemId: "i", quantity: 1 }], payments: [], ledger: [],
  };
  it("changes when a quantity or a name changes, not only lengths", () => {
    const a = fingerprint(base);
    expect(fingerprint({ ...base, selections: [{ participantId: "p", itemId: "i", quantity: 2 }] })).not.toBe(a);
    expect(fingerprint({ ...base, participants: [{ id: "p", displayName: "B" }] })).not.toBe(a);
    expect(fingerprint(base)).toBe(a);
  });
});
