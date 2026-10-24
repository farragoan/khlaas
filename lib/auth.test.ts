import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { resolveHost, hashToken, type HostCandidate } from "./auth";

const t = (n: number) => new Date(2026, 0, 1, 0, 0, n);
const creator: HostCandidate = { id: "c", userId: "user_creator", sessionToken: hashToken("ctok"), joinedAt: t(5) };
const stranger: HostCandidate = { id: "s", userId: null, sessionToken: hashToken("stok"), joinedAt: t(1) };

describe("resolveHost", () => {
  it("makes the creator host even when a stranger joined first", () => {
    const rows = [stranger, creator];
    expect(resolveHost("user_creator", rows, { tokenHash: hashToken("ctok") })).toEqual({ id: "c" });
    expect(resolveHost("user_creator", rows, { clerkUserId: "user_creator" })).toEqual({ id: "c" });
  });

  it("refuses the earliest joiner when the table has a creator", () => {
    expect(resolveHost("user_creator", [stranger, creator], { tokenHash: hashToken("stok") })).toBeNull();
  });

  it("refuses everyone when the creator has not joined", () => {
    expect(resolveHost("user_creator", [stranger], { tokenHash: hashToken("stok") })).toBeNull();
    expect(resolveHost("user_creator", [stranger], { clerkUserId: "user_creator" })).toBeNull();
  });

  it("refuses a different signed-in user and a wrong token", () => {
    expect(resolveHost("user_creator", [creator], { clerkUserId: "user_other" })).toBeNull();
    expect(resolveHost("user_creator", [creator], { tokenHash: hashToken("nope") })).toBeNull();
    expect(resolveHost("user_creator", [creator], {})).toBeNull();
  });

  it("falls back to the earliest joiner only for legacy tables without a creator", () => {
    expect(resolveHost(null, [creator, stranger], { tokenHash: hashToken("stok") })).toEqual({ id: "s" });
    expect(resolveHost(null, [creator, stranger], { tokenHash: hashToken("ctok") })).toBeNull();
    expect(resolveHost(null, [], { tokenHash: hashToken("ctok") })).toBeNull();
  });
});
