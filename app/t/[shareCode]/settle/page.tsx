"use client";

import { use, useEffect, useState, lazy } from "react";
import { useRouter } from "next/navigation";
import { Share2, ChevronLeft, RotateCcw, AlertTriangle, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useTableData } from "@/hooks/use-table-data";
import { useSession } from "@/hooks/use-session";
import { Price } from "@/components/price";
import { SettleSkeleton } from "@/components/settle-skeleton";
import { CurrencyProvider } from "@/lib/currency-context";
import { UpiAppModal } from "@/components/upi-app-modal";
import type { LedgerEntry, Payment, Item } from "@/lib/db/schema";
import type { Selection, PublicParticipant } from "@/hooks/use-table-data";

const MotionDiv = lazy(() =>
  import("framer-motion").then((m) => ({ default: m.motion.div }))
);
const AnimatePresenceLazy = lazy(() =>
  import("framer-motion").then((m) => ({ default: m.AnimatePresence }))
);

function participantName(id: string, participants: PublicParticipant[]) {
  return participants.find((p) => p.id === id)?.displayName ?? "Unknown";
}

/** Compute per-person consumed amount (food + proportional fees + tip) */
function computeConsumed(
  participantId: string,
  regularItems: Item[],
  feeItems: Item[],
  selections: Selection[],
  tip: number,
  discountRatio?: number | null
) {
  // Food subtotals by participant (quantity-weighted)
  const foodSubtotals: Record<string, number> = {};
  for (const item of regularItems) {
    const itemSelections = selections.filter((s) => s.itemId === item.id);
    if (itemSelections.length === 0) continue;
    const totalAllocated = itemSelections.reduce((sum, s) => sum + s.quantity, 0);
    if (totalAllocated === 0) continue;
    for (const s of itemSelections) {
      const share = (s.quantity / totalAllocated) * parseFloat(item.totalPrice ?? "0");
      foodSubtotals[s.participantId] = (foodSubtotals[s.participantId] ?? 0) + share;
    }
  }

  const grandFoodSubtotal = Object.values(foodSubtotals).reduce((a, b) => a + b, 0);
  const myFoodSubtotal = foodSubtotals[participantId] ?? 0;
  const n = new Set(selections.map((s) => s.participantId)).size || 1;
  const proportion = grandFoodSubtotal > 0 ? myFoodSubtotal / grandFoodSubtotal : 1 / n;

  const totalFees = feeItems.reduce((s, f) => s + parseFloat(f.totalPrice ?? "0"), 0);
  const myFeeShare = totalFees * proportion;
  const myTipShare = tip * proportion;

  const r = discountRatio ?? 1;
  const scaledFood = myFoodSubtotal * r;
  const scaledFees = myFeeShare * r;

  return {
    food: scaledFood,
    fees: scaledFees,
    tip: myTipShare,
    total: scaledFood + scaledFees + myTipShare,
    proportion,
  };
}

function PersonDetail({
  participant,
  items,
  selections,
  payments,
  tip,
  discountRatio,
  onClose,
}: {
  participant: PublicParticipant;
  items: Item[];
  selections: Selection[];
  payments: Payment[];
  tip: number;
  discountRatio?: number | null;
  onClose: () => void;
}) {
  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);

  const consumed = computeConsumed(participant.id, regularItems, feeItems, selections, tip, discountRatio);

  const myFoodRows = regularItems
    .filter((i) => selections.some((s) => s.itemId === i.id && s.participantId === participant.id))
    .map((i) => {
      const itemSelections = selections.filter((s) => s.itemId === i.id);
      const totalAllocated = itemSelections.reduce((sum, s) => sum + s.quantity, 0);
      const mySel = itemSelections.find((s) => s.participantId === participant.id);
      const myQty = mySel?.quantity ?? 1;
      const myShare = totalAllocated > 0
        ? (myQty / totalAllocated) * parseFloat(i.totalPrice ?? "0")
        : 0;
      return { id: i.id, name: i.name, itemQuantity: i.quantity, myQty, myShare, totalAllocated };
    });

  const paid = parseFloat(payments.find((p) => p.participantId === participant.id)?.amount ?? "0");
  const net = consumed.total - paid;

  return (
    <MotionDiv
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

      {/* Share summary */}
      <div className="mb-4 px-4 py-3 bg-zinc-900/50 rounded-xl">
        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Share</div>
        <Price amount={consumed.total} className="text-xl font-bold text-zinc-100" />
      </div>

      {/* Food items breakdown */}
      <div className="space-y-3 mb-4">
        {myFoodRows.length === 0 && (
          <p className="text-zinc-500 text-sm py-4 text-center">No items selected</p>
        )}
        {myFoodRows.map((row) => (
          <div key={row.id} className="flex items-center justify-between text-sm">
            <div>
              <span className="text-zinc-200">{row.name}</span>
              {row.itemQuantity > 1 && (
                <span className="text-zinc-500 ml-1.5 text-xs">
                  {row.myQty}/{row.totalAllocated} allocated
                </span>
              )}
            </div>
            <Price amount={row.myShare} className="text-zinc-300" />
          </div>
        ))}
      </div>

      {/* Fees and tip */}
      {(feeItems.length > 0 || consumed.tip > 0) && (
        <div className="border-t border-zinc-800 pt-3 space-y-2 mb-4">
          {feeItems.map((f) => (
            <div key={f.id} className="flex justify-between text-sm">
              <span className="text-zinc-400">{f.name}</span>
              <Price amount={parseFloat(f.totalPrice ?? "0") * consumed.proportion} className="text-zinc-400" />
            </div>
          ))}
          {consumed.tip > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Tip (your share)</span>
              <Price amount={consumed.tip} className="text-zinc-400" />
            </div>
          )}
        </div>
      )}

      {/* Paid and net */}
      <div className="border-t border-zinc-800 pt-3 space-y-2">
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
    </MotionDiv>
  );
}

function PersonTotal({
  participant,
  entries,
  items,
  selections,
  payments,
  tip,
  discountRatio,
  index,
  onClick,
}: {
  participant: PublicParticipant;
  entries: LedgerEntry[];
  items: Item[];
  selections: Selection[];
  payments: Payment[];
  tip: number;
  discountRatio?: number | null;
  index: number;
  onClick: () => void;
}) {
  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);
  const consumed = computeConsumed(participant.id, regularItems, feeItems, selections, tip, discountRatio);

  const owes = entries.filter((e) => e.fromParticipant === participant.id);
  const receives = entries.filter((e) => e.toParticipant === participant.id);
  const totalOwed = owes.reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalReceives = receives.reduce((s, e) => s + parseFloat(e.amount), 0);
  const net = totalOwed - totalReceives;

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: "spring", damping: 20 }}
    >
      <button
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
        <div className="text-right">
          <div className="text-xs text-zinc-500">Share</div>
          <Price amount={consumed.total} className="text-sm text-zinc-300 block" />
          <div className={`text-base font-semibold ${net > 0.005 ? "text-[var(--danger)]" : "text-[var(--selected)]"}`}>
            {net > 0.005 ? "Owes" : net < -0.005 ? "Gets back" : "Settled ✓"}
            {Math.abs(net) > 0.005 && (
              <> <Price amount={Math.abs(net)} className="inline" /></>
            )}
          </div>
        </div>
      </button>
    </MotionDiv>
  );
}

function ReopenConfirmModal({
  hostName,
  onConfirm,
  onCancel,
  loading,
}: {
  hostName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center"
      onClick={onCancel}
    >
      <MotionDiv
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#1A1A1A] rounded-t-2xl px-4 pt-5 pb-10"
      >
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold mb-1">Re-open this bill?</h3>
            <p className="text-zinc-400 text-sm">
              This will clear the current settlement. {hostName} and everyone else can update their selections.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl active:scale-95 transition-all disabled:opacity-60"
          >
            {loading ? "Reopening…" : "Re-open bill"}
          </button>
          <button
            onClick={onCancel}
            className="w-full h-12 text-zinc-400 text-sm hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </MotionDiv>
    </MotionDiv>
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
  const { session } = useSession(data?.table?.id ?? null);
  const [detailParticipant, setDetailParticipant] = useState<PublicParticipant | null>(null);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [upiModalData, setUpiModalData] = useState<{
    upiId: string;
    name: string;
    amount: number;
  } | null>(null);
  const [upiPromptDismissed, setUpiPromptDismissed] = useState(false);
  const [upiInput, setUpiInput] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);

  useEffect(() => {
    if (!loading && data && data.table.status !== "settled") {
      router.replace(`/t/${shareCode}`);
    }
  }, [data?.table?.status, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !data) {
    return <SettleSkeleton />;
  }

  const { table, participants, ledger, payments, items, selections } = data;
  const tip = parseFloat(table.tip ?? "0");

  const billTotal = items.reduce((sum, i) => sum + parseFloat(i.totalPrice ?? "0"), 0);
  const actualPaidTotal = table.actualPaidTotal ? parseFloat(table.actualPaidTotal) : null;
  const discountRatio = actualPaidTotal != null && billTotal > 0 ? actualPaidTotal / billTotal : null;
  const isHost = data.isHost;

  // Show UPI prompt if current user is owed money but has no UPI ID
  const myParticipant = participants.find((p) => p.id === session?.participantId);
  const iAmOwed = ledger.some((e) => e.toParticipant === session?.participantId);
  const showUpiPrompt = iAmOwed && !myParticipant?.upiId && !upiPromptDismissed;

  if (data.table.status !== "settled") {
    return null;
  }

  function handleShare() {
    const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: table.currency ?? "INR" });
    const consolidated: Record<string, number> = {};
    for (const e of ledger) {
      const key = `${e.fromParticipant}→${e.toParticipant}`;
      consolidated[key] = (consolidated[key] ?? 0) + parseFloat(e.amount);
    }
    const lines = Object.entries(consolidated).map(([key, total]) => {
      const [from, to] = key.split("→");
      return `${participantName(from, participants)} pays ${participantName(to, participants)} ${fmt.format(total)}`;
    });
    const text = `Bill settled via खल्लास:\n${lines.join("\n")}`;
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Summary copied!");
    }
  }

  async function handleSaveUpi() {
    if (!upiInput.trim() || !session) return;
    setSavingUpi(true);
    try {
      const res = await fetch("/api/user-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upiId: upiInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      // Update local participant data
      const me = participants.find((p) => p.id === session.participantId);
      if (me) me.upiId = upiInput.trim();
      setUpiPromptDismissed(true);
      toast.success("UPI ID saved!");
    } catch {
      toast.error("Couldn't save UPI ID");
    } finally {
      setSavingUpi(false);
    }
  }

  async function handleReopen() {
    if (!session) return;
    setReopening(true);
    try {
      const res = await fetch(`/api/tables/${shareCode}/reopen`, {
        method: "POST",
        headers: { "x-session-token": session.sessionToken },
      });
      if (!res.ok) throw new Error("Failed");
      router.replace(`/t/${shareCode}`);
    } catch {
      toast.error("Couldn't reopen the bill, try again");
      setReopening(false);
      setShowReopenModal(false);
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

        <MotionDiv
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white mb-2"
        >
          All settled ✓
        </MotionDiv>
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
              items={items}
              selections={selections}
              payments={payments}
              tip={tip}
              discountRatio={discountRatio}
              index={i}
              onClick={() => setDetailParticipant(p)}
            />
          ))}
        </div>

        {/* UPI ID prompt */}
        {showUpiPrompt && (
          <MotionDiv
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 px-4 py-3 bg-zinc-900/50 rounded-xl"
          >
            <p className="text-sm text-zinc-300 mb-2">
              Add UPI ID to let your friends pay you from खल्लास
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="yourname@upi"
                value={upiInput}
                onChange={(e) => setUpiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveUpi()}
                className="flex-1 h-9 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={handleSaveUpi}
                disabled={savingUpi || !upiInput.trim()}
                className="h-9 px-3 bg-[var(--brand)] text-black text-xs font-semibold rounded-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                {savingUpi ? "…" : "Save"}
              </button>
            </div>
          </MotionDiv>
        )}

        {/* Transfer list */}
        {ledger.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">Transfers needed</p>
            {ledger.map((entry, i) => {
              const recipient = participants.find((p) => p.id === entry.toParticipant);
              const recipientUpiId = recipient?.upiId;
              const canPay = recipientUpiId && session?.participantId === entry.fromParticipant;
              return (
                <MotionDiv
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
                  {canPay && (
                    <button
                      onClick={() =>
                        setUpiModalData({
                          upiId: recipientUpiId,
                          name: recipient?.displayName ?? "",
                          amount: parseFloat(entry.amount),
                        })
                      }
                      className="flex items-center gap-1 ml-2 px-2.5 py-1 bg-[var(--brand)] text-black text-xs font-semibold rounded-lg active:scale-95 transition-transform flex-shrink-0"
                    >
                      <Smartphone size={12} />
                      Pay
                    </button>
                  )}
                </MotionDiv>
              );
            })}
          </div>
        )}

        {ledger.length === 0 && (
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-zinc-500 text-center py-8"
          >
            Everyone&apos;s even — no transfers needed
          </MotionDiv>
        )}

        {/* Re-open bill (host only) */}
        {isHost && (
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 flex flex-col items-center gap-3"
          >
            <p className="text-zinc-500 text-sm">Want to change something?</p>
            <button
              onClick={() => setShowReopenModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[var(--surface-raised)] hover:bg-zinc-600 text-zinc-200 text-sm font-medium rounded-xl active:scale-95 transition-all"
            >
              <RotateCcw size={14} />
              Re-open bill
            </button>
          </MotionDiv>
        )}
      </main>

      {/* Per-person detail panel */}
      <AnimatePresenceLazy>
        {detailParticipant && (
          <PersonDetail
            participant={detailParticipant}
            items={items}
            selections={selections}
            payments={payments}
            tip={tip}
            discountRatio={discountRatio}
            onClose={() => setDetailParticipant(null)}
          />
        )}
      </AnimatePresenceLazy>

      {/* Reopen confirmation modal */}
      <AnimatePresenceLazy>
        {showReopenModal && (
          <ReopenConfirmModal
            hostName={participants[0]?.displayName ?? "You"}
            onConfirm={handleReopen}
            onCancel={() => setShowReopenModal(false)}
            loading={reopening}
          />
        )}
      </AnimatePresenceLazy>

      {/* UPI app chooser modal */}
      {upiModalData && (
        <UpiAppModal
          isOpen={true}
          onClose={() => setUpiModalData(null)}
          upiId={upiModalData.upiId}
          name={upiModalData.name}
          amount={upiModalData.amount}
          currency={table.currency ?? "INR"}
        />
      )}
    </>
    </CurrencyProvider>
  );
}
