import { paiseToUnits, splitPaise, toPaise, type Paise } from "../money";
import type {
  LedgerItem,
  LedgerParticipant,
  LedgerSelection,
  LedgerPayment,
  LedgerResult,
  ParticipantBreakdown,
  ParticipantItemShare,
} from "./types";

type Amount = number | string;

/**
 * Per-person breakdown: item shares, apportioned fees and tip, and the net
 * position after payments. computeLedger simplifies these nets into transfers;
 * anything that has to explain a number — an export, a receipt — reads this so
 * the arithmetic exists in exactly one place.
 *
 * All arithmetic is integer paise. Every split goes through splitPaise
 * (largest remainder), so the parts of any split sum to the whole exactly and
 * no paisa is created or lost. Returned amounts are currency units that are
 * exact to two decimals.
 */
export function computeBreakdown(
  items: LedgerItem[],
  participants: LedgerParticipant[],
  selections: LedgerSelection[],
  payments: LedgerPayment[],
  tip: Amount,
  actualPaidTotal?: Amount | null
): ParticipantBreakdown[] {
  const n = participants.length;
  if (n === 0) return [];

  const shares: Record<string, { itemId: string; quantity: number; paise: Paise }[]> = {};
  const food: Record<string, Paise> = {};
  for (const p of participants) {
    shares[p.id] = [];
    food[p.id] = 0;
  }

  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);

  // Step 1: split each regular item across its claimants by allocated quantity.
  for (const item of regularItems) {
    const itemSelections = selections.filter((s) => s.itemId === item.id);
    if (itemSelections.length === 0) continue;
    const totalAllocated = itemSelections.reduce((sum, s) => sum + s.quantity, 0);
    if (totalAllocated === 0) continue;
    const parts = splitPaise(
      toPaise(item.totalPrice),
      itemSelections.map((s) => s.quantity)
    );
    itemSelections.forEach((s, idx) => {
      shares[s.participantId]?.push({ itemId: item.id, quantity: s.quantity, paise: parts[idx] });
      if (food[s.participantId] !== undefined) food[s.participantId] += parts[idx];
    });
  }

  const foodWeights = participants.map((p) => food[p.id]);
  const grandFood = foodWeights.reduce((a, b) => a + b, 0);
  const totalFees = feeItems.reduce((sum, f) => sum + toPaise(f.totalPrice), 0);

  // Step 2: receipt fees follow the share of the food (equal split if nobody
  // has claimed anything). Step 3: tip follows the same weights.
  const feeParts = splitPaise(totalFees, foodWeights);
  const tipParts = splitPaise(toPaise(tip), foodWeights);

  // Step 2b: a discount benefits the whole table, so it scales food and fees
  // alike (tip is added afterwards and is never discounted). The discounted
  // total is split by each person's pre-discount food+fees, then each person's
  // slice is split again across their lines, so every level sums exactly.
  const totalBill = grandFood + totalFees;
  const actual = actualPaidTotal == null ? null : toPaise(actualPaidTotal);
  const discounted = actual != null && actual >= 0 && totalBill > 0;
  const perPerson = discounted
    ? splitPaise(actual, participants.map((p, i) => food[p.id] + feeParts[i]))
    : null;

  const paid: Record<string, Paise> = {};
  for (const p of participants) paid[p.id] = 0;
  for (const payment of payments) {
    if (paid[payment.participantId] !== undefined) paid[payment.participantId] += toPaise(payment.amount);
  }

  return participants.map((p, i) => {
    const lines = shares[p.id];
    let linePaise = lines.map((l) => l.paise);
    let feePaise = feeParts[i];
    if (perPerson) {
      const scaled = splitPaise(perPerson[i], [...linePaise, feePaise]);
      feePaise = scaled.pop() as Paise;
      linePaise = scaled;
    }
    const itemShares: ParticipantItemShare[] = lines.map((l, idx) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      amount: paiseToUnits(linePaise[idx]),
    }));
    const owes = linePaise.reduce((a, b) => a + b, 0) + feePaise + tipParts[i];

    return {
      participantId: p.id,
      itemShares,
      fees: paiseToUnits(feePaise),
      tip: paiseToUnits(tipParts[i]),
      owes: paiseToUnits(owes),
      paid: paiseToUnits(paid[p.id]),
      net: paiseToUnits(owes - paid[p.id]),
    };
  });
}

export function computeLedger(
  items: LedgerItem[],
  participants: LedgerParticipant[],
  selections: LedgerSelection[],
  payments: LedgerPayment[],
  tip: Amount,
  actualPaidTotal?: Amount | null
): LedgerResult[] {
  if (participants.length === 0) return [];

  // Nets in integer paise: creditor net < 0 (overpaid, others owe them),
  // debtor net > 0 (underpaid). Exact integers, so no epsilon is needed.
  const net = computeBreakdown(items, participants, selections, payments, tip, actualPaidTotal).map(
    (b) => [b.participantId, toPaise(b.net)] as const
  );

  const creditors = net.filter(([, v]) => v < 0).map(([id, v]) => ({ id, amount: -v }));
  const debtors = net.filter(([, v]) => v > 0).map(([id, v]) => ({ id, amount: v }));

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  // Greedy debt simplification.
  const results: LedgerResult[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const payment = Math.min(creditor.amount, debtor.amount);

    results.push({
      fromParticipant: debtor.id,
      toParticipant: creditor.id,
      amount: paiseToUnits(payment),
    });

    creditor.amount -= payment;
    debtor.amount -= payment;
    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return results;
}
