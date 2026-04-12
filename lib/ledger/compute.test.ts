import { describe, it, expect } from "vitest";
import { computeLedger } from "./compute";
import type { LedgerItem, LedgerParticipant, LedgerSelection } from "./types";

const p = (id: string): LedgerParticipant => ({ id, displayName: id });
const item = (id: string, price: string, isFee = false): LedgerItem => ({
  id,
  totalPrice: price,
  isFee,
});
const sel = (participantId: string, itemId: string): LedgerSelection => ({
  participantId,
  itemId,
});

describe("computeLedger", () => {
  it("two people, one item each — no shared items, no fees", () => {
    const participants = [p("alice"), p("bob")];
    const itemList = [item("i1", "10.00"), item("i2", "20.00")];
    const selections = [sel("alice", "i1"), sel("bob", "i2")];

    const result = computeLedger(itemList, participants, selections);

    // alice owes 10, bob owes 20 — bob pays alice 5 (net: bob -5, alice +5 relative to equal split)
    // Actually: alice subtotal=10, bob subtotal=20, total=30
    // No fees, no debt between them unless we compute net balances
    // alice owes 10, bob owes 20, total=30, average=15
    // net: alice = 10-15 = -5 (debtor), bob = 20-15 = +5 (creditor)
    // alice pays bob 5
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("alice");
    expect(result[0].toParticipant).toBe("bob");
    expect(result[0].amount).toBeCloseTo(5.00, 2);
  });

  it("three people split one shared item equally", () => {
    const participants = [p("alice"), p("bob"), p("carol")];
    const itemList = [item("i1", "30.00")];
    const selections = [sel("alice", "i1"), sel("bob", "i1"), sel("carol", "i1")];

    const result = computeLedger(itemList, participants, selections);

    // Each owes 10 — no debt between participants (all equal), no ledger entries
    expect(result).toHaveLength(0);
  });

  it("four people, mixed items with tax and service charge fees", () => {
    // alice: burger 12, bob: salad 8, carol+dave share pizza 20
    // fee: tax 4 (is_fee)
    const participants = [p("alice"), p("bob"), p("carol"), p("dave")];
    const itemList = [
      item("burger", "12.00"),
      item("salad", "8.00"),
      item("pizza", "20.00"),
      item("tax", "4.00", true),
    ];
    const selections = [
      sel("alice", "burger"),
      sel("bob", "salad"),
      sel("carol", "pizza"),
      sel("dave", "pizza"),
      // alice selects burger, bob salad, carol+dave split pizza
    ];

    const result = computeLedger(itemList, participants, selections);

    // item subtotals: alice=12, bob=8, carol=10, dave=10. grand_subtotal=40
    // fee 4 distributed proportionally:
    //   alice: 4*(12/40) = 1.20, bob: 4*(8/40) = 0.80, carol: 4*(10/40) = 1.00, dave: 4*(10/40) = 1.00
    // totals: alice=13.20, bob=8.80, carol=11.00, dave=11.00
    // average = 44/4 = 11.00
    // net: alice owes +2.20, bob owes -2.20, carol=0, dave=0
    // bob pays alice 2.20
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(2.20, 2);
  });

  it("one person ate everything", () => {
    const participants = [p("alice"), p("bob")];
    const itemList = [item("i1", "50.00")];
    const selections = [sel("alice", "i1")];

    const result = computeLedger(itemList, participants, selections);

    // alice owes 50, bob owes 0 — bob pays alice 25 (so alice net: -25, bob net: +25... wait)
    // total=50, alice owes 50, bob owes 0
    // net balance: alice = 50 - 25 = +25 (creditor), bob = 0 - 25 = -25 (debtor)
    // bob pays alice 25
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(25.00, 2);
  });

  it("fees only, no regular items selected", () => {
    const participants = [p("alice"), p("bob")];
    const itemList = [item("tax", "10.00", true)];
    const selections: LedgerSelection[] = [];

    const result = computeLedger(itemList, participants, selections);

    // grand_subtotal = 0, so fee distribution falls back to equal split
    // alice: 5, bob: 5 — equal, no debt
    expect(result).toHaveLength(0);
  });
});
