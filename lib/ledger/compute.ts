import type { LedgerItem, LedgerParticipant, LedgerSelection, LedgerResult } from "./types";

export function computeLedger(
  items: LedgerItem[],
  participants: LedgerParticipant[],
  selections: LedgerSelection[]
): LedgerResult[] {
  const n = participants.length;
  if (n === 0) return [];

  // Map participant id → amount owed
  const owes: Record<string, number> = {};
  for (const p of participants) owes[p.id] = 0;

  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);

  // Step 1: assign regular item costs
  for (const item of regularItems) {
    const selectors = selections
      .filter((s) => s.itemId === item.id)
      .map((s) => s.participantId);
    if (selectors.length === 0) continue;
    const share = parseFloat(item.totalPrice) / selectors.length;
    for (const pid of selectors) {
      owes[pid] = (owes[pid] ?? 0) + share;
    }
  }

  // Step 2: distribute fees proportionally (by each participant's subtotal)
  const grandSubtotal = Object.values(owes).reduce((a, b) => a + b, 0);
  const totalFees = feeItems.reduce(
    (sum, f) => sum + parseFloat(f.totalPrice),
    0
  );

  if (totalFees > 0) {
    for (const pid of Object.keys(owes)) {
      const proportion =
        grandSubtotal > 0 ? owes[pid] / grandSubtotal : 1 / n;
      owes[pid] += totalFees * proportion;
    }
  }

  // Step 3: compute net balances (net = what you owe - average)
  const total = Object.values(owes).reduce((a, b) => a + b, 0);
  const average = total / n;
  const net: Record<string, number> = {};
  for (const pid of Object.keys(owes)) {
    net[pid] = owes[pid] - average; // positive = creditor (paid more), negative = debtor
  }

  // Step 4: greedy debt simplification
  const results: LedgerResult[] = [];
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0.005)
    .map(([id, v]) => ({ id, amount: v }));
  const debtors = Object.entries(net)
    .filter(([, v]) => v < -0.005)
    .map(([id, v]) => ({ id, amount: -v })); // store as positive

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
