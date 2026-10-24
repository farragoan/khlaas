import { describe, it, expect } from "vitest";
import { leaseValue, leaseIsLive, LEASE_MS } from "./scan-lease";

describe("scan lease", () => {
  it("is live right after it is taken and expires after LEASE_MS", () => {
    const v = leaseValue(1000);
    expect(leaseIsLive(v, 1000)).toBe(true);
    expect(leaseIsLive(v, 1000 + LEASE_MS - 1)).toBe(true);
    expect(leaseIsLive(v, 1000 + LEASE_MS)).toBe(false);
  });
  it("ignores null, empty and unrelated raw_ocr content", () => {
    for (const v of [null, undefined, "", "{\"items\":[]}", "scanning:abc"]) expect(leaseIsLive(v, 5)).toBe(false);
  });
});
