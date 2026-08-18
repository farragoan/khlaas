import { describe, it, expect } from "vitest";
import { computeBreakdown, computeLedger } from "./compute";
import type { LedgerItem, LedgerParticipant, LedgerSelection, LedgerPayment } from "./types";

const p = (id: string): LedgerParticipant => ({ id, displayName: id });
const item = (id: string, price: string, isFee = false): LedgerItem => ({ id, totalPrice: price, isFee, quantity: 1 });
const sel = (participantId: string, itemId: string): LedgerSelection => ({ participantId, itemId, quantity: 1 });
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

  describe("discount (actualPaidTotal)", () => {
    it("no discount when actualPaidTotal is null — identical to base case", () => {
      const resultNoDiscount = computeLedger(
        [item("i1", "100.00"), item("i2", "200.00")],
        [p("alice"), p("bob")],
        [sel("alice", "i1"), sel("bob", "i2")],
        [pay("alice", 300)],
        0,
        null
      );
      const resultUndefined = computeLedger(
        [item("i1", "100.00"), item("i2", "200.00")],
        [p("alice"), p("bob")],
        [sel("alice", "i1"), sel("bob", "i2")],
        [pay("alice", 300)],
        0
      );
      expect(resultNoDiscount).toEqual(resultUndefined);
    });

    it("10% discount — every participant's share reduced by 10%", () => {
      // bill total = 300, actual paid = 270 (10% off)
      // alice ate 100, bob ate 200. alice paid 270 (full discounted bill), bob paid 0.
      // without discount: alice owes 100, bob owes 200. bob pays alice 200.
      // with discount (ratio=0.9): alice owes 90, bob owes 180.
      // net: alice = 90-270 = -180, bob = 180-0 = 180. bob pays alice 180.
      const result = computeLedger(
        [item("i1", "100.00"), item("i2", "200.00")],
        [p("alice"), p("bob")],
        [sel("alice", "i1"), sel("bob", "i2")],
        [pay("alice", 270)],
        0,
        270
      );
      expect(result).toHaveLength(1);
      expect(result[0].fromParticipant).toBe("bob");
      expect(result[0].toParticipant).toBe("alice");
      expect(result[0].amount).toBeCloseTo(180, 2);
    });

    it("50% discount — halves everyone's share", () => {
      // bill = 1000, actual paid = 500. alice ate 400, bob ate 600.
      // alice paid 500, bob paid 0.
      // discounted: alice owes 200, bob owes 300.
      // net: alice = 200-500 = -300, bob = 300. bob pays alice 300.
      const result = computeLedger(
        [item("i1", "400.00"), item("i2", "600.00")],
        [p("alice"), p("bob")],
        [sel("alice", "i1"), sel("bob", "i2")],
        [pay("alice", 500)],
        0,
        500
      );
      expect(result).toHaveLength(1);
      expect(result[0].fromParticipant).toBe("bob");
      expect(result[0].toParticipant).toBe("alice");
      expect(result[0].amount).toBeCloseTo(300, 2);
    });

    it("discount with fees — fees scaled proportionally too", () => {
      // bill = 300 (food) + 30 (tax fee) = 330 total. actual paid = 297 (10% off).
      // alice ate 100, bob ate 200. tax = 30.
      // without discount: alice owes 110, bob owes 220. alice paid 330. bob pays alice 220.
      // with discount (ratio=297/330=0.9): alice owes 99, bob owes 198.
      // net: alice = 99-297 = -198, bob = 198. bob pays alice 198.
      const result = computeLedger(
        [item("i1", "100.00"), item("i2", "200.00"), item("tax", "30.00", true)],
        [p("alice"), p("bob")],
        [sel("alice", "i1"), sel("bob", "i2")],
        [pay("alice", 297)],
        0,
        297
      );
      expect(result).toHaveLength(1);
      expect(result[0].fromParticipant).toBe("bob");
      expect(result[0].toParticipant).toBe("alice");
      expect(result[0].amount).toBeCloseTo(198, 2);
    });

    it("discount with tip — tip is NOT scaled by discount", () => {
      // bill = 300, actual paid = 270 (10% off). tip = 60.
      // alice ate 100, bob ate 200. alice paid 330 (270 + 60 tip).
      // discounted food+fees: alice owes 90, bob owes 180. tip: alice=20, bob=40.
      // total: alice=110, bob=220.
      // net: alice = 110-330 = -220, bob = 220. bob pays alice 220.
      const result = computeLedger(
        [item("i1", "100.00"), item("i2", "200.00")],
        [p("alice"), p("bob")],
        [sel("alice", "i1"), sel("bob", "i2")],
        [pay("alice", 330)],
        60,
        270
      );
      expect(result).toHaveLength(1);
      expect(result[0].fromParticipant).toBe("bob");
      expect(result[0].toParticipant).toBe("alice");
      expect(result[0].amount).toBeCloseTo(220, 2);
    });

    it("discount with split payments — both paid some amount", () => {
      // bill = 1000, actual paid = 900 (10% off). alice ate 400, bob ate 600.
      // alice paid 600, bob paid 300. total paid = 900. ✓
      // discounted: alice owes 360, bob owes 540.
      // net: alice = 360-600 = -240, bob = 540-300 = 240.
      // bob pays alice 240.
      const result = computeLedger(
        [item("i1", "400.00"), item("i2", "600.00")],
        [p("alice"), p("bob")],
        [sel("alice", "i1"), sel("bob", "i2")],
        [pay("alice", 600), pay("bob", 300)],
        0,
        900
      );
      expect(result).toHaveLength(1);
      expect(result[0].fromParticipant).toBe("bob");
      expect(result[0].toParticipant).toBe("alice");
      expect(result[0].amount).toBeCloseTo(240, 2);
    });

    it("discount equal to bill total — no effect (ratio=1)", () => {
      // bill = 300, actual paid = 300. Same as no discount.
      const result = computeLedger(
        [item("i1", "100.00"), item("i2", "200.00")],
        [p("alice"), p("bob")],
        [sel("alice", "i1"), sel("bob", "i2")],
        [pay("alice", 300)],
        0,
        300
      );
      expect(result).toHaveLength(1);
      expect(result[0].fromParticipant).toBe("bob");
      expect(result[0].toParticipant).toBe("alice");
      expect(result[0].amount).toBeCloseTo(200, 2);
    });

    it("three participants with discount — correct proportional reduction", () => {
      // bill = 600. alice=100, bob=200, carol=300. actual paid = 540 (10% off).
      // alice paid 540, others paid 0.
      // discounted: alice owes 90, bob owes 180, carol owes 270.
      // net: alice=90-540=-450, bob=180, carol=270.
      // bob pays alice 180, carol pays alice 270.
      const result = computeLedger(
        [item("i1", "100.00"), item("i2", "200.00"), item("i3", "300.00")],
        [p("alice"), p("bob"), p("carol")],
        [sel("alice", "i1"), sel("bob", "i2"), sel("carol", "i3")],
        [pay("alice", 540)],
        0,
        540
      );
      expect(result).toHaveLength(2);
      const bobEntry = result.find((r) => r.fromParticipant === "bob");
      const carolEntry = result.find((r) => r.fromParticipant === "carol");
      expect(bobEntry?.toParticipant).toBe("alice");
      expect(bobEntry?.amount).toBeCloseTo(180, 2);
      expect(carolEntry?.toParticipant).toBe("alice");
      expect(carolEntry?.amount).toBeCloseTo(270, 2);
    });
  });
});

describe("computeBreakdown", () => {
  it("splits an item by allocated quantity, not per head", () => {
    const [alice, bob] = computeBreakdown(
      [{ id: "i1", totalPrice: "300.00", isFee: false, quantity: 3 }],
      [p("alice"), p("bob")],
      [
        { participantId: "alice", itemId: "i1", quantity: 2 },
        { participantId: "bob", itemId: "i1", quantity: 1 },
      ],
      [],
      0
    );
    expect(alice.itemShares).toHaveLength(1);
    expect(alice.itemShares[0].amount).toBeCloseTo(200, 2);
    expect(bob.itemShares[0].amount).toBeCloseTo(100, 2);
  });

  it("apportions fees and tip by share of the food", () => {
    // alice ate 100, bob ate 300. fees 40, tip 80 → alice takes a quarter.
    const [alice, bob] = computeBreakdown(
      [item("i1", "100.00"), item("i2", "300.00"), item("f1", "40.00", true)],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [],
      80
    );
    expect(alice.fees).toBeCloseTo(10, 2);
    expect(alice.tip).toBeCloseTo(20, 2);
    expect(bob.fees).toBeCloseTo(30, 2);
    expect(bob.tip).toBeCloseTo(60, 2);
  });

  it("owes equals item shares plus fees plus tip, so an export reconciles", () => {
    const breakdown = computeBreakdown(
      [item("i1", "100.00"), item("i2", "300.00"), item("f1", "40.00", true)],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [pay("alice", 220)],
      80
    );
    for (const b of breakdown) {
      const lines = b.itemShares.reduce((sum, s) => sum + s.amount, 0);
      expect(lines + b.fees + b.tip).toBeCloseTo(b.owes, 6);
      expect(b.net).toBeCloseTo(b.owes - b.paid, 6);
    }
  });

  it("a discount scales food and fees but never the tip", () => {
    // bill is 400 food + 40 fees = 440, actually paid 220 → half price.
    const [alice] = computeBreakdown(
      [item("i1", "100.00"), item("i2", "300.00"), item("f1", "40.00", true)],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [],
      80,
      220
    );
    expect(alice.itemShares[0].amount).toBeCloseTo(50, 2);
    expect(alice.fees).toBeCloseTo(5, 2);
    expect(alice.tip).toBeCloseTo(20, 2);
  });

  it("nets agree with the transfers computeLedger derives from them", () => {
    const billItems = [item("i1", "100.00"), item("i2", "200.00")];
    const people = [p("alice"), p("bob")];
    const claims = [sel("alice", "i1"), sel("bob", "i2")];
    const paid = [pay("alice", 300)];

    const breakdown = computeBreakdown(billItems, people, claims, paid, 0);
    const transfers = computeLedger(billItems, people, claims, paid, 0);
    const owedByBob = breakdown.find((b) => b.participantId === "bob")!.net;
    expect(transfers[0].amount).toBeCloseTo(owedByBob, 2);
  });

  it("returns nothing when there are no participants", () => {
    expect(computeBreakdown([item("i1", "100.00")], [], [], [], 0)).toEqual([]);
  });
});
