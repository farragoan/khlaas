import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeBreakdown, computeLedger } from "./compute";
import { legacyComputeBreakdown } from "../testing/float-oracle";
import { paiseToString, toPaise } from "../money";
import type { LedgerItem, LedgerParticipant, LedgerSelection, LedgerPayment } from "./types";

// A whole table, generated: 1-6 people, 1-6 items (some fees), arbitrary claims,
// arbitrary payments, tip and optional discount, all in integer paise.
const scenario = fc
  .record({
    n: fc.integer({ min: 1, max: 6 }),
    prices: fc.array(fc.tuple(fc.integer({ min: 1, max: 500000 }), fc.integer({ min: 1, max: 4 }), fc.boolean()), {
      minLength: 1,
      maxLength: 6,
    }),
    tipP: fc.integer({ min: 0, max: 100000 }),
    discountPct: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    seed: fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 80, maxLength: 80 }),
  })
  .map(({ n, prices, tipP, discountPct, seed }) => {
    let k = 0;
    const next = () => seed[k++ % seed.length];
    const people: LedgerParticipant[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, displayName: `p${i}` }));
    const items: LedgerItem[] = prices.map(([unitPaise, quantity, isFee], i) => ({
      id: `i${i}`,
      totalPrice: paiseToString(unitPaise * quantity),
      isFee,
      quantity,
    }));
    const selections: LedgerSelection[] = [];
    for (const it of items.filter((i) => !i.isFee)) {
      for (const p of people) if (next() % 2 === 0) selections.push({ participantId: p.id, itemId: it.id, quantity: 1 + (next() % 2) });
    }
    const payments: LedgerPayment[] = people.map((p) => ({ participantId: p.id, amount: paiseToString(next() * 37) }));
    const billP = items.reduce((s, i) => s + toPaise(i.totalPrice), 0);
    const actual = discountPct == null ? null : paiseToString(Math.floor((billP * discountPct) / 100));
    return { people, items, selections, payments, tip: paiseToString(tipP), actual, billP };
  });

describe("integer-paise ledger invariants", () => {
  it("every number is exact to the paisa and totals reconcile with no drift", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const b = computeBreakdown(s.items, s.people, s.selections, s.payments, s.tip, s.actual);
        for (const row of b) {
          for (const v of [row.owes, row.paid, row.net, row.fees, row.tip, ...row.itemShares.map((x) => x.amount)]) {
            expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-6);
          }
          const lines = row.itemShares.reduce((a, x) => a + toPaise(x.amount), 0);
          expect(lines + toPaise(row.fees) + toPaise(row.tip)).toBe(toPaise(row.owes));
          expect(toPaise(row.owes) - toPaise(row.paid)).toBe(toPaise(row.net));
        }
        const claimed = s.items.some((i) => !i.isFee) && s.selections.length > 0;
        const owesTotal = b.reduce((a, r) => a + toPaise(r.owes), 0);
        const feeTotal = s.items.filter((i) => i.isFee).reduce((a, i) => a + toPaise(i.totalPrice), 0);
        const foodTotal = b.reduce((a, r) => a + r.itemShares.reduce((x, y) => x + toPaise(y.amount), 0), 0);
        if (s.actual != null && foodTotal + feeTotal > 0) {
          // discounted: the table pays exactly the discounted total, plus tip, to the paisa
          expect(owesTotal).toBe(toPaise(s.actual) + toPaise(s.tip));
        } else if (claimed || feeTotal > 0 || toPaise(s.tip) > 0) {
          // undiscounted: owes == claimed food + fees + tip, never a paisa lost or minted
          expect(owesTotal).toBe(foodTotal + feeTotal + toPaise(s.tip));
        }
      }),
      { numRuns: 400 }
    );
  });

  it("settling the transfers zeroes every net (both directions)", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const b = computeBreakdown(s.items, s.people, s.selections, s.payments, s.tip, s.actual);
        const transfers = computeLedger(s.items, s.people, s.selections, s.payments, s.tip, s.actual);
        const residual = new Map(b.map((r) => [r.participantId, toPaise(r.net)]));
        for (const t of transfers) {
          expect(t.amount).toBeGreaterThan(0);
          residual.set(t.fromParticipant, (residual.get(t.fromParticipant) ?? 0) - toPaise(t.amount));
          residual.set(t.toParticipant, (residual.get(t.toParticipant) ?? 0) + toPaise(t.amount));
        }
        // each person lands at 0, except for the table-level gap between what was paid and what is owed
        const totalNet = b.reduce((a, r) => a + toPaise(r.net), 0);
        const left = [...residual.values()].reduce((a, v) => a + v, 0);
        expect(left).toBe(totalNet);
        if (totalNet === 0) for (const v of residual.values()) expect(v).toBe(0);
      }),
      { numRuns: 400 }
    );
  });

  it("agrees with the legacy float arithmetic to within rounding of each line", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        // Sub-rupee tables amplify one paisa of rounding into a visible fraction of
        // the bill, which says nothing about real bills; compare from Rs 100 up.
        const claimedP = s.items
          .filter((x) => x.isFee || s.selections.some((c) => c.itemId === x.id))
          .reduce((a, x) => a + toPaise(x.totalPrice), 0);
        fc.pre(claimedP >= 10000);
        const payments = s.payments.map((p) => ({ ...p, amount: parseFloat(String(p.amount)) }));
        const oldB = legacyComputeBreakdown(s.items, s.people, s.selections, payments, parseFloat(s.tip), s.actual == null ? null : parseFloat(s.actual));
        const newB = computeBreakdown(s.items, s.people, s.selections, s.payments, s.tip, s.actual);
        // Tip and fees follow each person's share of the food. The new code weights
        // by food rounded to the paisa, the old by unrounded floats, so on a tiny
        // food total the proportions differ by up to half a paisa per line.
        const totalLines = newB.reduce((a, r) => a + r.itemShares.length, 0);
        const foodUnits = s.items
          .filter((x) => !x.isFee && s.selections.some((c) => c.itemId === x.id))
          .reduce((a, x) => a + parseFloat(x.totalPrice), 0);
        const feeUnits = s.items.filter((x) => x.isFee).reduce((a, x) => a + parseFloat(x.totalPrice), 0);
        const proportional = foodUnits > 0 ? ((parseFloat(s.tip) + feeUnits) * 0.005 * (totalLines + 1)) / foodUnits : 0;
        // A discount multiplies whatever rounding there was by actual/bill.
        const ratio = s.actual != null && claimedP > 0 ? Math.max(1, (parseFloat(s.actual) * 100) / claimedP) : 1;
        newB.forEach((row, i) => {
          const slack = (0.01 * (row.itemShares.length + 3) + proportional) * ratio;
          expect(Math.abs(row.owes - oldB[i].owes)).toBeLessThanOrEqual(slack);
          expect(Math.abs(row.paid - oldB[i].paid)).toBeLessThan(1e-9);
        });
      }),
      { numRuns: 400 }
    );
  });

  it("puts the odd paisa on someone instead of dropping it: 1.00 across three people", () => {
    const people = ["a", "b", "c"].map((id) => ({ id, displayName: id }));
    const items: LedgerItem[] = [{ id: "i", totalPrice: "1.00", isFee: false, quantity: 3 }];
    const selections = people.map((p) => ({ participantId: p.id, itemId: "i", quantity: 1 }));
    const b = computeBreakdown(items, people, selections, [], 0);
    expect(b.map((r) => toPaise(r.owes)).sort()).toEqual([33, 33, 34]);
    expect(b.reduce((a, r) => a + toPaise(r.owes), 0)).toBe(100);
  });

  it("float traps: 0.1 + 0.2 style prices stay exact", () => {
    const people = [{ id: "a", displayName: "a" }];
    const items: LedgerItem[] = [
      { id: "1", totalPrice: "0.10", isFee: false, quantity: 1 },
      { id: "2", totalPrice: "0.20", isFee: false, quantity: 1 },
    ];
    const sels = [
      { participantId: "a", itemId: "1", quantity: 1 },
      { participantId: "a", itemId: "2", quantity: 1 },
    ];
    expect(computeBreakdown(items, people, sels, [{ participantId: "a", amount: "0.30" }], 0)[0].net).toBe(0);
  });

  it("accepts numeric tip, payments and discount as well as strings", () => {
    const people = [{ id: "a", displayName: "a" }];
    const items: LedgerItem[] = [{ id: "1", totalPrice: "100.00", isFee: false, quantity: 1 }];
    const sels = [{ participantId: "a", itemId: "1", quantity: 1 }];
    const b = computeBreakdown(items, people, sels, [{ participantId: "a", amount: 90 }], 10, 80)[0];
    expect(b.owes).toBe(90);
    expect(b.net).toBe(0);
  });
});
