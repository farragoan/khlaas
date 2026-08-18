import type {
  LedgerItem,
  LedgerParticipant,
  LedgerSelection,
  LedgerPayment,
  LedgerResult,
  ParticipantBreakdown,
  ParticipantItemShare,
} from "./types";

/**
 * Per-person breakdown: item shares, apportioned fees and tip, and the net
 * position after payments. computeLedger simplifies these nets into transfers;
 * anything that has to explain a number — an export, a receipt — reads this so
 * the arithmetic exists in exactly one place.
 */
export function computeBreakdown(
  items: LedgerItem[],
  participants: LedgerParticipant[],
  selections: LedgerSelection[],
  payments: LedgerPayment[],
  tip: number,
  actualPaidTotal?: number | null
): ParticipantBreakdown[] {
  const n = participants.length;
  if (n === 0) return [];

  const itemShares: Record<string, ParticipantItemShare[]> = {};
  const foodSubtotal: Record<string, number> = {};
  for (const p of participants) {
    itemShares[p.id] = [];
    foodSubtotal[p.id] = 0;
  }

  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);

  // Step 1: assign regular item costs — split by allocated quantity
  for (const item of regularItems) {
    const itemSelections = selections.filter((s) => s.itemId === item.id);
    if (itemSelections.length === 0) continue;
    const totalAllocated = itemSelections.reduce((sum, s) => sum + s.quantity, 0);
    if (totalAllocated === 0) continue;
    for (const s of itemSelections) {
      const share = (s.quantity / totalAllocated) * parseFloat(item.totalPrice);
      itemShares[s.participantId]?.push({ itemId: item.id, quantity: s.quantity, amount: share });
      if (foodSubtotal[s.participantId] !== undefined) foodSubtotal[s.participantId] += share;
    }
  }

  const grandFoodSubtotal = Object.values(foodSubtotal).reduce((a, b) => a + b, 0);
  const totalFees = feeItems.reduce((sum, f) => sum + parseFloat(f.totalPrice), 0);

  // Step 2b: a discount benefits the whole table, so it scales food and fees
  // alike. Tip is added afterwards and is never discounted.
  const totalBill = grandFoodSubtotal + totalFees;
  const discountRatio =
    actualPaidTotal != null && actualPaidTotal >= 0 && totalBill > 0
      ? actualPaidTotal / totalBill
      : 1;

  const paid: Record<string, number> = {};
  for (const p of participants) paid[p.id] = 0;
  for (const payment of payments) {
    paid[payment.participantId] = (paid[payment.participantId] ?? 0) + payment.amount;
  }

  return participants.map((p) => {
    const proportion = grandFoodSubtotal > 0 ? foodSubtotal[p.id] / grandFoodSubtotal : 1 / n;

    // Step 2: receipt fees are apportioned by share of the food, not per head.
    const fees = totalFees * proportion * discountRatio;
    // Step 3: tip follows the same proportion.
    const tipShare = tip > 0 ? tip * proportion : 0;

    const shares = itemShares[p.id].map((s) => ({ ...s, amount: s.amount * discountRatio }));
    const owes = shares.reduce((sum, s) => sum + s.amount, 0) + fees + tipShare;

    return {
      participantId: p.id,
      itemShares: shares,
      fees,
      tip: tipShare,
      owes,
      paid: paid[p.id],
      net: owes - paid[p.id],
    };
  });
}

export function computeLedger(
  items: LedgerItem[],
  participants: LedgerParticipant[],
  selections: LedgerSelection[],
  payments: LedgerPayment[],
  tip: number,
  actualPaidTotal?: number | null
): LedgerResult[] {
  if (participants.length === 0) return [];

  const net: Record<string, number> = {};
  for (const b of computeBreakdown(items, participants, selections, payments, tip, actualPaidTotal)) {
    net[b.participantId] = b.net;
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
