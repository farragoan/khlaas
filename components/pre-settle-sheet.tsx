"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { PublicParticipant } from "@/hooks/use-table-data";
import { Price } from "@/components/price";
import { useCurrency, getCurrencySymbol } from "@/lib/currency-context";
import { parseLocalizedNumber } from "@/lib/utils";

interface Props {
  tableId: string;
  sessionToken: string;
  participants: PublicParticipant[];
  billTotal: number;
  initialTip?: number;
  prefilledAmounts?: Record<string, number>;
  onSettled: () => void;
  onClose: () => void;
}

export function PreSettleSheet({
  tableId,
  sessionToken,
  participants,
  billTotal,
  initialTip,
  prefilledAmounts,
  onSettled,
  onClose,
}: Props) {
  const currency = useCurrency();
  const currencySymbol = getCurrencySymbol(currency);

  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      participants.map((p) => [
        p.id,
        prefilledAmounts?.[p.id] != null
          ? String(prefilledAmounts[p.id])
          : "",
      ])
    )
  );
  const [tip, setTip] = useState(initialTip != null ? String(initialTip) : "");
  const [submitting, setSubmitting] = useState(false);

  const tipAmount = parseLocalizedNumber(tip || "0");

  const totalEntered =
    participants.reduce((sum, p) => {
      return sum + parseLocalizedNumber(amounts[p.id] || "0");
    }, 0) + tipAmount;

  const totalWithTip = billTotal + tipAmount;
  const mismatch = totalEntered > 0.5 && Math.abs(totalEntered - totalWithTip) > 0.5;

  async function handleSubmit() {
    const paymentEntries = participants
      .map((p) => ({ participantId: p.id, amount: parseLocalizedNumber(amounts[p.id] || "0") }));

    const hasAnyPayment = paymentEntries.some((e) => e.amount > 0);
    if (!hasAnyPayment) {
      toast.error("At least one person must have paid");
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(
        paymentEntries.map((e) =>
          fetch("/api/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
            body: JSON.stringify({ tableId, participantId: e.participantId, amount: e.amount }),
          }).then((r) => {
            if (!r.ok) throw new Error("payment failed");
          })
        )
      );

      const res = await fetch("/api/ledger/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ tableId, tip: tipAmount }),
      });
      if (!res.ok) throw new Error("compute failed");

      onSettled();
    } catch {
      toast.error("Couldn't settle up, try again");
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#1A1A1A] rounded-t-2xl px-4 pt-5 pb-10 max-w-lg mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Who paid?</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Bill total */}
        <div className="flex justify-between items-center mb-5 px-1">
          <span className="text-zinc-400 text-sm">Bill total</span>
          <Price amount={billTotal} className="text-white font-semibold" />
        </div>

        {/* Tip row */}
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-zinc-800">
          <span className="text-zinc-200 text-sm flex-1">Add tip</span>
          <div className="flex items-center gap-1 bg-[var(--surface)] rounded-xl px-3 py-2">
            <span className="text-zinc-400 text-sm">{currencySymbol}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              className="w-20 bg-transparent text-zinc-100 text-sm text-right outline-none"
            />
          </div>
        </div>

        {/* Per-participant payment inputs */}
        <div className="space-y-3 mb-5">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 flex-shrink-0">
                {p.displayName[0].toUpperCase()}
              </div>
              <span className="text-zinc-200 text-sm flex-1">{p.displayName}</span>
              <div className="flex items-center gap-1 bg-[var(--surface)] rounded-xl px-3 py-2">
                <span className="text-zinc-400 text-sm">{currencySymbol}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={amounts[p.id]}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="w-20 bg-transparent text-zinc-100 text-sm text-right outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Running total vs bill */}
        <div
          className={`flex justify-between text-sm mb-5 px-1 ${
            mismatch ? "text-amber-400" : "text-zinc-500"
          }`}
        >
          <span>Total entered</span>
          <span>
            <Price amount={totalEntered} className="inline" />
            {mismatch && (
              <span className="ml-1 text-xs opacity-80">
                (bill + tip: <Price amount={totalWithTip} className="inline" />)
              </span>
            )}
          </span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-14 bg-[var(--brand)] hover:bg-amber-300 active:scale-95 text-black font-semibold text-base rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        >
          {submitting ? <Loader2 size={20} className="animate-spin" /> : "Settle up →"}
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
