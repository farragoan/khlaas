"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useTableData } from "@/hooks/use-table-data";
import { Price } from "@/components/price";
import { CurrencyProvider } from "@/lib/currency-context";
import type { Participant, LedgerEntry, Payment, Item } from "@/lib/db/schema";
import type { Selection } from "@/hooks/use-table-data";

function participantName(id: string, participants: Participant[]) {
  return participants.find((p) => p.id === id)?.displayName ?? "Unknown";
}

function PersonDetail({
  participant,
  items,
  selections,
  payments,
  tip,
  onClose,
}: {
  participant: Participant;
  items: Item[];
  selections: Selection[];
  payments: Payment[];
  tip: number;
  onClose: () => void;
}) {
  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);

  // Compute food subtotals for all participants to get proportions
  const allFoodSubtotals: Record<string, number> = {};
  for (const item of regularItems) {
    const selectors = selections.filter((s) => s.itemId === item.id);
    if (selectors.length === 0) continue;
    const share = parseFloat(item.totalPrice ?? "0") / selectors.length;
    for (const s of selectors) {
      allFoodSubtotals[s.participantId] = (allFoodSubtotals[s.participantId] ?? 0) + share;
    }
  }
  const grandFoodSubtotal = Object.values(allFoodSubtotals).reduce((a, b) => a + b, 0);
  const myFoodSubtotal = allFoodSubtotals[participant.id] ?? 0;
  const n = new Set(selections.map((s) => s.participantId)).size || 1;
  const proportion = grandFoodSubtotal > 0 ? myFoodSubtotal / grandFoodSubtotal : 1 / n;

  const totalFees = feeItems.reduce((s, f) => s + parseFloat(f.totalPrice ?? "0"), 0);
  const myFeeShare = totalFees * proportion;
  const myTipShare = tip * proportion;

  // Rows for items this participant selected
  const myFoodRows = regularItems
    .filter((i) => selections.some((s) => s.itemId === i.id && s.participantId === participant.id))
    .map((i) => {
      const selectorCount = selections.filter((s) => s.itemId === i.id).length;
      const myShare = parseFloat(i.totalPrice ?? "0") / selectorCount;
      return { id: i.id, name: i.name, quantity: i.quantity, myShare, selectorCount };
    });

  const totalOwed = myFoodSubtotal + myFeeShare + myTipShare;
  const paid = parseFloat(payments.find((p) => p.participantId === participant.id)?.amount ?? "0");
  const net = totalOwed - paid;

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="fixed inset-0 bg-[#0F0F0F] z-50 flex flex-col max-w-lg mx-auto px-4 pb-16 overflow-y-auto"
    >
      <div className="flex items-center gap-3 py-5">
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200">
            {participant.displayName[0].toUpperCase()}
          </div>
          <span className="text-white font-semibold">{participant.displayName}</span>
        </div>
      </div>

      {/* Food items */}
      <div className="space-y-3 mb-4">
        {myFoodRows.length === 0 && (
          <p className="text-zinc-500 text-sm py-4 text-center">No items selected</p>
        )}
        {myFoodRows.map((row) => (
          <div key={row.id} className="flex items-center justify-between text-sm">
            <div>
              <span className="text-zinc-200">{row.name}</span>
              {row.selectorCount > 1 && (
                <span className="text-zinc-500 ml-1.5 text-xs">÷{row.selectorCount}</span>
              )}
            </div>
            <Price amount={row.myShare} className="text-zinc-300" />
          </div>
        ))}
      </div>

      {/* Fees + tip */}
      {(feeItems.length > 0 || myTipShare > 0) && (
        <div className="border-t border-zinc-800 pt-3 space-y-2 mb-4">
          {feeItems.map((f) => (
            <div key={f.id} className="flex justify-between text-sm">
              <span className="text-zinc-400">{f.name}</span>
              <Price amount={parseFloat(f.totalPrice ?? "0") * proportion} className="text-zinc-400" />
            </div>
          ))}
          {myTipShare > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Tip (your share)</span>
              <Price amount={myTipShare} className="text-zinc-400" />
            </div>
          )}
        </div>
      )}

      {/* Totals */}
      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Total owed</span>
          <Price amount={totalOwed} className="text-zinc-200 font-medium" />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Paid</span>
          <Price amount={paid} className="text-[var(--selected)] font-medium" />
        </div>
        <div className="flex justify-between text-base font-semibold pt-2 border-t border-zinc-800">
          <span className={net > 0.005 ? "text-[var(--danger)]" : "text-[var(--selected)]"}>
            {net > 0.005 ? "Still owes" : net < -0.005 ? "Gets back" : "Settled ✓"}
          </span>
          {Math.abs(net) > 0.005 && (
            <Price
              amount={Math.abs(net)}
              className={net > 0.005 ? "text-[var(--danger)]" : "text-[var(--selected)]"}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function PersonTotal({
  participant,
  entries,
  index,
  onClick,
}: {
  participant: Participant;
  entries: LedgerEntry[];
  index: number;
  onClick: () => void;
}) {
  const owes = entries.filter((e) => e.fromParticipant === participant.id);
  const receives = entries.filter((e) => e.toParticipant === participant.id);
  const totalOwed = owes.reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalReceives = receives.reduce((s, e) => s + parseFloat(e.amount), 0);
  const net = totalOwed - totalReceives;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: "spring", damping: 20 }}
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-4 bg-[var(--surface)] rounded-xl active:scale-[0.98] transition-transform text-left"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200">
          {participant.displayName[0].toUpperCase()}
        </div>
        <div>
          <span className="font-medium text-zinc-100 block">{participant.displayName}</span>
          <span className="text-xs text-zinc-500">Tap for breakdown</span>
        </div>
      </div>
      <Price
        amount={Math.abs(net)}
        className={`text-base font-semibold ${net > 0.005 ? "text-[var(--danger)]" : "text-[var(--selected)]"}`}
      />
    </motion.button>
  );
}

export default function SettlePage({
  params,
}: {
  params: Promise<{ shareCode: string }>;
}) {
  const { shareCode } = use(params);
  const router = useRouter();
  const { data, loading } = useTableData(shareCode);
  const [detailParticipant, setDetailParticipant] = useState<Participant | null>(null);

  if (loading || !data) {
    return (
      <div className="min-h-dvh bg-[#0F0F0F] flex items-center justify-center">
        <div className="animate-pulse text-zinc-600">Loading…</div>
      </div>
    );
  }

  const { table, participants, ledger, payments, items, selections } = data;
  const tip = parseFloat(table.tip ?? "0");

  if (table.status !== "settled") {
    router.replace(`/t/${shareCode}`);
    return null;
  }

  function handleShare() {
    const lines = ledger
      .map(
        (e) =>
          `${participantName(e.fromParticipant, participants)} pays ${participantName(e.toParticipant, participants)} ${new Intl.NumberFormat(undefined, { style: "currency", currency: table.currency ?? "INR" }).format(parseFloat(e.amount))}`
      )
      .join("\n");
    const text = `Bill settled via khlaas:\n${lines}`;
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Summary copied!");
    }
  }

  return (
    <CurrencyProvider value={table.currency ?? "INR"}>
    <>
      <main className="min-h-dvh bg-[#0F0F0F] flex flex-col max-w-lg mx-auto px-4 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between py-5">
          <button
            onClick={() => router.push(`/t/${shareCode}`)}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-[var(--brand)] font-bold text-xl">खल्लास</h1>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Share2 size={16} />
            Share
          </button>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white mb-2"
        >
          All settled ✓
        </motion.h2>
        <p className="text-zinc-400 text-sm mb-6">Tap a person to see their breakdown</p>

        {/* Paid by */}
        {payments.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-zinc-500 uppercase tracking-wider px-1 mb-2">Paid by</p>
            <div className="flex flex-wrap gap-2">
              {payments.map((pay) => (
                <div
                  key={pay.id}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)] rounded-xl text-sm"
                >
                  <span className="font-medium text-zinc-200">
                    {participantName(pay.participantId, participants)}
                  </span>
                  <Price amount={pay.amount} className="text-[var(--selected)]" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-person totals */}
        <div className="space-y-2 mb-8">
          {participants.map((p, i) => (
            <PersonTotal
              key={p.id}
              participant={p}
              entries={ledger}
              index={i}
              onClick={() => setDetailParticipant(p)}
            />
          ))}
        </div>

        {/* Transfer list */}
        {ledger.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">Transfers needed</p>
            {ledger.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className="flex items-center gap-2 px-4 py-3 bg-[var(--surface-raised)] rounded-xl text-sm"
              >
                <span className="font-medium text-zinc-200">
                  {participantName(entry.fromParticipant, participants)}
                </span>
                <span className="text-zinc-500">pays</span>
                <span className="font-medium text-zinc-200">
                  {participantName(entry.toParticipant, participants)}
                </span>
                <Price amount={entry.amount} className="ml-auto text-[var(--brand)]" />
              </motion.div>
            ))}
          </div>
        )}

        {ledger.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-zinc-500 text-center py-8"
          >
            Everyone&apos;s even — no transfers needed
          </motion.p>
        )}
      </main>

      {/* Per-person detail panel */}
      <AnimatePresence>
        {detailParticipant && (
          <PersonDetail
            participant={detailParticipant}
            items={items}
            selections={selections}
            payments={payments}
            tip={tip}
            onClose={() => setDetailParticipant(null)}
          />
        )}
      </AnimatePresence>
    </>
    </CurrencyProvider>
  );
}
