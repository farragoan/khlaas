import { describe, it, expect } from "vitest";
import { computeLedger } from "./compute";
import type { LedgerItem, LedgerParticipant, LedgerSelection, LedgerPayment } from "./types";

const p = (id: string): LedgerParticipant => ({ id, displayName: id });
const item = (id: string, price: string, isFee = false): LedgerItem => ({ id, totalPrice: price, isFee });
const sel = (participantId: string, itemId: string): LedgerSelection => ({ participantId, itemId });
const pay = (participantId: string, amount: number): LedgerPayment => ({ participantId, amount });

describe("computeLedger", () => {
  it("one payer covers full bill — other person owes their share", () => {
    // alice ate 100, bob ate 200. alice paid 300 (full bill). bob owes alice 200.
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00")],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [pay("alice", 300)],
      0
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(200, 2);
  });

  it("two payers, three people — correct net transfers", () => {
    // alice ate 100, bob ate 200, carol ate 200. total = 500.
    // alice paid 300, bob paid 200, carol paid 0.
    // net: alice = 100-300 = -200 (creditor), bob = 200-200 = 0, carol = 200-0 = 200 (debtor)
    // carol pays alice 200
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00"), item("i3", "200.00")],
      [p("alice"), p("bob"), p("carol")],
      [sel("alice", "i1"), sel("bob", "i2"), sel("carol", "i3")],
      [pay("alice", 300), pay("bob", 200)],
      0
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("carol");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(200, 2);
  });

  it("everyone paid exactly their own share — no transfers needed", () => {
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00")],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [pay("alice", 100), pay("bob", 200)],
      0
    );
    expect(result).toHaveLength(0);
  });

  it("tip distributed proportionally to food subtotals", () => {
    // alice ate 100, bob ate 200. alice paid 360 (300 bill + 60 tip). bob paid 0.
    // tip=60: alice tip share = 60*(100/300)=20, bob tip share = 60*(200/300)=40
    // owes: alice=120, bob=240
    // net: alice = 120-360 = -240, bob = 240-0 = 240
    // bob pays alice 240
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00")],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [pay("alice", 360)],
      60
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(240, 2);
  });

  it("receipt fees (tax) distributed proportionally and included in net", () => {
    // alice ate 100, bob ate 200. tax fee = 30 (is_fee=true).
    // tax: alice = 30*(100/300)=10, bob = 30*(200/300)=20
    // owes: alice=110, bob=220. alice paid 330 total.
    // net: alice=110-330=-220, bob=220-0=220
    // bob pays alice 220
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00"), item("tax", "30.00", true)],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [pay("alice", 330)],
      0
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(220, 2);
  });

  it("shared item split equally among selectors", () => {
    // alice and bob share a 90 item. alice also ate a 30 item alone. alice paid 120.
    // owes: alice = 45+30=75, bob = 45. alice paid 120.
    // net: alice = 75-120 = -45, bob = 45-0 = 45. bob pays alice 45.
    const result = computeLedger(
      [item("shared", "90.00"), item("solo", "30.00")],
      [p("alice"), p("bob")],
      [sel("alice", "shared"), sel("bob", "shared"), sel("alice", "solo")],
      [pay("alice", 120)],
      0
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(45, 2);
  });

  it("debt minimisation — two debtors, one creditor", () => {
    // alice paid 300, bob ate 150, carol ate 150, alice ate nothing.
    // net: alice = 0-300 = -300, bob = 150, carol = 150.
    // bob pays alice 150, carol pays alice 150.
    const result = computeLedger(
      [item("i1", "150.00"), item("i2", "150.00")],
      [p("alice"), p("bob"), p("carol")],
      [sel("bob", "i1"), sel("carol", "i2")],
      [pay("alice", 300)],
      0
    );
    expect(result).toHaveLength(2);
    const bobEntry = result.find((r) => r.fromParticipant === "bob");
    const carolEntry = result.find((r) => r.fromParticipant === "carol");
    expect(bobEntry?.toParticipant).toBe("alice");
    expect(bobEntry?.amount).toBeCloseTo(150, 2);
    expect(carolEntry?.toParticipant).toBe("alice");
    expect(carolEntry?.amount).toBeCloseTo(150, 2);
  });

  it("tip only (no food items) — split equally when no food subtotal", () => {
    // no food, tip=40, 2 participants. alice paid 40.
    // grandFoodSubtotal=0 → equal split fallback: each owes 20.
    // net: alice = 20-40 = -20, bob = 20-0 = 20. bob pays alice 20.
    const result = computeLedger(
      [],
      [p("alice"), p("bob")],
      [],
      [pay("alice", 40)],
      40
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(20, 2);
  });
});
