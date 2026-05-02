"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Share2, Loader2, Users, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { useTableData } from "@/hooks/use-table-data";
import { useSession } from "@/hooks/use-session";
import { ParticipantJoin } from "@/components/participant-join";
import { ReceiptUpload } from "@/components/receipt-upload";
import { ProcessingState } from "@/components/processing-state";
import { ItemList } from "@/components/item-list";
import { PreSettleSheet } from "@/components/pre-settle-sheet";
import { ShareRoomSheet } from "@/components/share-room-sheet";
import { CurrencyProvider, getCurrencySymbol } from "@/lib/currency-context";
import type { Selection } from "@/hooks/use-table-data";
import { parseLocalizedNumber } from "@/lib/utils";

// Phase state machine for post-scan flow
// idle    = before any scan
// success = 1-second success state after OCR completes
// share   = share sheet shown (QR + invite)
// items   = item selection view
type Phase = "idle" | "success" | "share" | "items";
type PaymentMode = "host" | "split" | null;

function HostProcessingPanel({
  currency,
  paymentMode,
  onPaymentModeChange,
  wantTip,
  onWantTipChange,
  tipInput,
  onTipInputChange,
}: {
  currency: string;
  paymentMode: PaymentMode;
  onPaymentModeChange: (m: PaymentMode) => void;
  wantTip: boolean;
  onWantTipChange: (v: boolean) => void;
  tipInput: string;
  onTipInputChange: (v: string) => void;
}) {
  const currencySymbol = getCurrencySymbol(currency);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: "spring", damping: 24, stiffness: 260 }}
      className="mt-6 space-y-5"
    >
      <p className="text-zinc-400 text-sm text-center animate-pulse">
        Processing your receipt in the background…
      </p>

      {/* Who paid */}
      <div className="bg-[var(--surface)] rounded-2xl px-4 py-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Who paid?</p>
        <div className="space-y-2">
          {(["host", "split"] as const).map((mode) => {
            const label = mode === "host" ? "I paid everything" : "We split the bill";
            const selected = paymentMode === mode;
            return (
              <button
                key={mode}
                onClick={() => onPaymentModeChange(mode)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-sm font-medium text-left ${
                  selected
                    ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    selected ? "border-[var(--brand)]" : "border-zinc-600"
                  }`}
                >
                  {selected && <span className="w-2 h-2 rounded-full bg-[var(--brand)]" />}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tip */}
      <div className="bg-[var(--surface)] rounded-2xl px-4 py-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Add a tip?</p>
        <div className="flex gap-2">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => onWantTipChange(v)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                wantTip === v
                  ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {v ? "Yes" : "No"}
            </button>
          ))}
        </div>
        <AnimatePresence>
          {wantTip && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 bg-[var(--surface-raised)] rounded-xl px-4 py-2.5 mt-1">
                <span className="text-zinc-400 text-sm">{currencySymbol}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={tipInput}
                  onChange={(e) => onTipInputChange(e.target.value)}
                  className="flex-1 bg-transparent text-zinc-100 text-sm outline-none"
                  autoFocus
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function TablePage({
  params,
}: {
  params: Promise<{ shareCode: string }>;
}) {
  const { shareCode } = use(params);
  const router = useRouter();
  const { data, error, loading, refresh } = useTableData(shareCode);
  const { session, saveSession } = useSession(data?.table?.id ?? null);
  const [localSelections, setLocalSelections] = useState<Selection[] | null>(null);
  const [showSettle, setShowSettle] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [editingParticipantId, setEditingParticipantId] = useState<string | undefined>(undefined);
  const prevStatusRef = useRef<string | null>(null);

  // Host processing state — captured while receipt OCR runs
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(null);
  const [wantTip, setWantTip] = useState(false);
  const [tipInput, setTipInput] = useState("");

  const currency = data?.table?.currency ?? "INR";
  const hostTip = wantTip ? parseLocalizedNumber(tipInput || "0") : 0;

  // Phase transitions based on table status
  useEffect(() => {
    if (!data) return;
    const status = data.table.status;
    const prev = prevStatusRef.current;

    if (prev === null) {
      // Initial load
      if (status === "items_ready" || status === "editing") {
        setPhase("items");
      }
      // status === "active" → phase stays "idle"
    } else if (prev === "active" && status === "items_ready") {
      // OCR just completed — show success then share sheet
      setUploadingReceipt(false);
      setPhase("success");
      const t = setTimeout(() => setPhase("share"), 1000);
      return () => clearTimeout(t);
    } else if (status === "editing" && phase === "idle") {
      setPhase("items");
    }

    prevStatusRef.current = status;
  }, [data?.table?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset editingParticipantId to own participant when entering edit mode
  useEffect(() => {
    if (data?.table?.status === "editing" && session) {
      setEditingParticipantId(session.participantId);
    }
  }, [data?.table?.status, session?.participantId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0F0F0F]">
        <Loader2 className="animate-spin text-zinc-600" size={32} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0F0F0F]">
        <p className="text-zinc-400">Table not found</p>
      </div>
    );
  }

  const { table, items, participants, selections } = data;
  const activeSelections = localSelections ?? selections;
  const isHost = !!session && participants[0]?.id === session.participantId;
  const isEditing = table.status === "editing";

  const billTotal = items.reduce((sum, i) => sum + parseFloat(i.totalPrice ?? "0"), 0);

  function handleShare() {
    const url = `${window.location.origin}/t/${shareCode}`;
    if (navigator.share) {
      navigator.share({ title: "Split this bill on खल्लास", url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  }

  async function handleSettleClick() {
    if (!session) return;
    if (paymentMode === "split") {
      // Skip payment collection — compute ledger directly
      try {
        const res = await fetch("/api/ledger/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-session-token": session.sessionToken },
          body: JSON.stringify({ tableId: table.id, tip: hostTip }),
        });
        if (!res.ok) throw new Error("compute failed");
        router.push(`/t/${shareCode}/settle`);
      } catch {
        toast.error("Couldn't settle up, try again");
      }
    } else {
      setShowSettle(true);
    }
  }

  if (table.status === "settled") {
    router.replace(`/t/${shareCode}/settle`);
    return null;
  }

  const showItems = table.status === "items_ready" || table.status === "editing";

  // Pre-filled host payment: if host said "I paid everything", seed their amount
  const prefilledAmounts: Record<string, number> | undefined =
    paymentMode === "host" && session
      ? { [session.participantId]: billTotal + hostTip }
      : undefined;

  return (
    <CurrencyProvider value={currency}>
    <main className="min-h-dvh bg-[#0F0F0F] flex flex-col max-w-lg mx-auto px-4 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between py-5">
        <h1 className="text-[var(--brand)] font-bold text-xl">खल्लास</h1>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Share2 size={16} />
          Share
        </button>
      </div>

      {/* Participants strip */}
      {participants.length > 0 && (
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
          <Users size={14} className="text-zinc-500 flex-shrink-0" />
          <div className="flex gap-2">
            {participants.map((p) => (
              <motion.div
                key={p.id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 18 }}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                  p.id === session?.participantId
                    ? "bg-[var(--brand)] text-black"
                    : "bg-[var(--surface-raised)] text-zinc-300"
                }`}
              >
                {isEditing && <Pencil size={10} />}
                {p.displayName}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <AnimatePresence mode="wait">
        {/* Idle: upload (host) or waiting (non-host) */}
        {table.status === "active" && phase === "idle" && isHost && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4 pt-4"
          >
            {!uploadingReceipt && (
              <p className="text-zinc-400 text-sm text-center">Scan your receipt to get started</p>
            )}
            <ReceiptUpload
              tableId={table.id}
              sessionToken={session!.sessionToken}
              onUploadStarted={() => setUploadingReceipt(true)}
              onProcessed={refresh}
            />
            {uploadingReceipt && (
              <HostProcessingPanel
                currency={currency}
                paymentMode={paymentMode}
                onPaymentModeChange={setPaymentMode}
                wantTip={wantTip}
                onWantTipChange={setWantTip}
                tipInput={tipInput}
                onTipInputChange={setTipInput}
              />
            )}
          </motion.div>
        )}

        {table.status === "active" && !isHost && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-4"
          >
            <p className="text-zinc-400 text-sm text-center mb-6">
              Waiting for the host to scan the receipt…
            </p>
            <ProcessingState />
          </motion.div>
        )}

        {/* Success state: 1s after OCR completes */}
        {phase === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-16 gap-4"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="w-16 h-16 rounded-full bg-[var(--brand)]/20 flex items-center justify-center"
            >
              <Check size={32} className="text-[var(--brand)]" />
            </motion.div>
            <div className="text-center">
              <p className="text-white font-semibold text-lg">Bill scanned!</p>
              <p className="text-zinc-400 text-sm">{items.length} items found</p>
            </div>
          </motion.div>
        )}

        {/* Share sheet */}
        {phase === "share" && (
          <motion.div
            key="share"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <ShareRoomSheet
              shareCode={shareCode}
              participants={participants}
              onContinue={() => setPhase("items")}
            />
          </motion.div>
        )}

        {/* Items view */}
        {showItems && phase === "items" && (
          <motion.div
            key="items"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {!isEditing && (
              <p className="text-sm text-zinc-400">Tap everything you ate</p>
            )}
            {session && (
              <ItemList
                items={items}
                participants={participants}
                selections={activeSelections}
                session={session}
                onSelectionsChange={setLocalSelections}
                isEditMode={isEditing}
                isHost={isHost}
                editingParticipantId={isEditing ? editingParticipantId : undefined}
                onEditingParticipantChange={isEditing && isHost ? setEditingParticipantId : undefined}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom bar */}
      {showItems && phase === "items" && isHost && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0F0F0F]/90 backdrop-blur-sm border-t border-zinc-800">
          <div className="max-w-lg mx-auto">
            <button
              onClick={handleSettleClick}
              className="w-full h-14 bg-[var(--brand)] hover:bg-amber-300 active:scale-95 text-black font-semibold text-base rounded-2xl flex items-center justify-center gap-2 transition-all"
            >
              Settle up →
            </button>
          </div>
        </div>
      )}

      {/* Non-host waiting message in edit mode */}
      {isEditing && !isHost && phase === "items" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0F0F0F]/90 backdrop-blur-sm border-t border-zinc-800">
          <div className="max-w-lg mx-auto">
            <p className="text-center text-zinc-500 text-sm">
              Waiting for {participants[0]?.displayName ?? "host"} to settle up…
            </p>
          </div>
        </div>
      )}

      {/* Pre-settle sheet (only shown when paymentMode is not "split") */}
      {showSettle && (
        <PreSettleSheet
          tableId={table.id}
          sessionToken={session!.sessionToken}
          participants={participants}
          billTotal={billTotal}
          initialTip={wantTip ? hostTip : undefined}
          prefilledAmounts={prefilledAmounts}
          onSettled={() => router.push(`/t/${shareCode}/settle`)}
          onClose={() => setShowSettle(false)}
        />
      )}

      {/* Join modal */}
      {!session && data && (
        <ParticipantJoin
          tableId={table.id}
          onJoined={(s) => {
            saveSession(s);
            refresh();
          }}
        />
      )}
    </main>
    </CurrencyProvider>
  );
}
