import type { LedgerItem, LedgerParticipant, LedgerSelection, LedgerPayment, LedgerResult } from "./types";

export function computeLedger(
  items: LedgerItem[],
  participants: LedgerParticipant[],
  selections: LedgerSelection[],
  payments: LedgerPayment[],
  tip: number
): LedgerResult[] {
  const n = participants.length;
  if (n === 0) return [];

  const owes: Record<string, number> = {};
  const foodSubtotal: Record<string, number> = {};
  for (const p of participants) {
    owes[p.id] = 0;
    foodSubtotal[p.id] = 0;
  }

  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);

  // Step 1: assign regular item costs — split equally among selectors
  for (const item of regularItems) {
    const selectors = selections
      .filter((s) => s.itemId === item.id)
      .map((s) => s.participantId);
    if (selectors.length === 0) continue;
    const share = parseFloat(item.totalPrice) / selectors.length;
    for (const pid of selectors) {
      owes[pid] += share;
      foodSubtotal[pid] += share;
    }
  }

  const grandFoodSubtotal = Object.values(foodSubtotal).reduce((a, b) => a + b, 0);

  // Step 2: distribute receipt fees proportionally by food subtotal
  const totalFees = feeItems.reduce((sum, f) => sum + parseFloat(f.totalPrice), 0);
  if (totalFees > 0) {
    for (const pid of Object.keys(owes)) {
      const proportion = grandFoodSubtotal > 0 ? foodSubtotal[pid] / grandFoodSubtotal : 1 / n;
      owes[pid] += totalFees * proportion;
    }
  }

  // Step 3: distribute tip proportionally by food subtotal
  if (tip > 0) {
    for (const pid of Object.keys(owes)) {
      const proportion = grandFoodSubtotal > 0 ? foodSubtotal[pid] / grandFoodSubtotal : 1 / n;
      owes[pid] += tip * proportion;
    }
  }

  // Step 4: net = owes - paid
  const paid: Record<string, number> = {};
  for (const p of participants) paid[p.id] = 0;
  for (const payment of payments) {
    paid[payment.participantId] = (paid[payment.participantId] ?? 0) + payment.amount;
  }

  const net: Record<string, number> = {};
  for (const pid of Object.keys(owes)) {
    net[pid] = owes[pid] - paid[pid];
  }

  // Step 5: greedy debt simplification
  // creditor: net < 0 (overpaid relative to their food share — others owe them)
  // debtor:   net > 0 (underpaid — they owe others)
  const results: LedgerResult[] = [];
  const creditors = Object.entries(net)
    .filter(([, v]) => v < -0.005)
    .map(([id, v]) => ({ id, amount: -v }));
  const debtors = Object.entries(net)
    .filter(([, v]) => v > 0.005)
    .map(([id, v]) => ({ id, amount: v }));

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const payment = Math.min(creditor.amount, debtor.amount);

    results.push({
      fromParticipant: debtor.id,
      toParticipant: creditor.id,
      amount: Math.round(payment * 100) / 100,
    });

    creditor.amount -= payment;
    debtor.amount -= payment;

    if (creditor.amount < 0.005) ci++;
    if (debtor.amount < 0.005) di++;
  }

  return results;
}
