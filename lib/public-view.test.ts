import { describe, it, expect } from "vitest";
import { publicParticipant, publicTable, findHostId } from "./public-view";
import type { SplitTable } from "@/lib/db/schema";

const row = {
  id: "p1", tableId: "t", displayName: "A", userId: "user_a", sessionToken: "hash",
  upiId: "a@upi", joinedAt: null, splitsSubmittedAt: null,
};
const none = { isMe: false, isHost: false, viewerIsParticipant: false, payOut: false };

describe("publicParticipant", () => {
  it("never leaks the session token or another person's userId", () => {
    const out = publicParticipant(row, none) as Record<string, unknown>;
    expect(out).not.toHaveProperty("sessionToken");
    expect(out.userId).toBeNull();
  });
  it("hides upiId from link-only viewers, shows it to self, host, and payout participants", () => {
    expect(publicParticipant(row, none).upiId).toBeNull();
    expect(publicParticipant(row, { ...none, viewerIsParticipant: true }).upiId).toBeNull();
    expect(publicParticipant(row, { ...none, isMe: true }).upiId).toBe("a@upi");
    expect(publicParticipant(row, { ...none, isHost: true }).upiId).toBe("a@upi");
    expect(publicParticipant(row, { ...none, viewerIsParticipant: true, payOut: true }).upiId).toBe("a@upi");
    expect(publicParticipant(row, { ...none, payOut: true }).upiId).toBeNull();
  });
  it("keeps userId on the viewer's own row", () => {
    expect(publicParticipant(row, { ...none, isMe: true }).userId).toBe("user_a");
  });
});

describe("publicTable", () => {
  it("drops createdBy, rawOcr, receiptUrl and keeps the rest", () => {
    const t = { id: "t", shareCode: "x", status: "active", createdBy: "u", rawOcr: "{}", receiptUrl: "http://r" } as unknown as SplitTable;
    const out = publicTable(t) as Record<string, unknown>;
    expect(out).toEqual({ id: "t", shareCode: "x", status: "active" });
  });
});

describe("findHostId", () => {
  const rows = [
    { id: "late-creator", userId: "u1", joinedAt: new Date(2) },
    { id: "early-guest", userId: null, joinedAt: new Date(1) },
  ];
  it("prefers the creator over the earliest joiner", () => {
    expect(findHostId("u1", rows)).toBe("late-creator");
  });
  it("is null when the creator has not joined, earliest joiner for legacy tables", () => {
    expect(findHostId("u9", rows)).toBeNull();
    expect(findHostId(null, rows)).toBe("early-guest");
  });
});
