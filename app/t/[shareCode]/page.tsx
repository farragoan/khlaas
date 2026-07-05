"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Share2, Loader2, Users, Pencil, Check, Clock, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import { nanoid } from "nanoid";
import { useTableData } from "@/hooks/use-table-data";
import { useSession } from "@/hooks/use-session";
import { ParticipantJoin } from "@/components/participant-join";
import { ReceiptUpload } from "@/components/receipt-upload";
import { ProcessingState } from "@/components/processing-state";
import { ItemList } from "@/components/item-list";
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

const CURRENCIES = [
  { code: "INR", label: "₹ INR" },
  { code: "USD", label: "$ USD" },
  { code: "EUR", label: "€ EUR" },
  { code: "GBP", label: "£ GBP" },
  { code: "AED", label: "د.إ AED" },
  { code: "SGD", label: "S$ SGD" },
];

function HostProcessingPanel({
  hostName,
  onHostNameChange,
  currency,
  onCurrencyChange,
  paymentMode,
  onPaymentModeChange,
  wantTip,
  onWantTipChange,
  tipInput,
  onTipInputChange,
  upiId,
  onUpiIdChange,
  onContinue,
  canContinue,
}: {
  hostName: string;
  onHostNameChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (c: string) => void;
  paymentMode: PaymentMode;
  onPaymentModeChange: (m: PaymentMode) => void;
  wantTip: boolean;
  onWantTipChange: (v: boolean) => void;
  tipInput: string;
  onTipInputChange: (v: string) => void;
  upiId: string;
  onUpiIdChange: (v: string) => void;
  onContinue: () => void;
  canContinue: boolean;
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

      {/* Your name */}
      <div className="bg-[var(--surface)] rounded-2xl px-4 py-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Your name</p>
        <input
          type="text"
          value={hostName}
          onChange={(e) => onHostNameChange(e.target.value)}
          maxLength={50}
          className="w-full bg-[var(--surface-raised)] text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
        />
      </div>

      {/* Currency selector */}
      <div className="bg-[var(--surface)] rounded-2xl px-4 py-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Currency</p>
        <div className="relative">
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="w-full appearance-none bg-[var(--surface-raised)] text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)] pr-10"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
      </div>

      {/* UPI ID */}
      <div className="bg-[var(--surface)] rounded-2xl px-4 py-4 space-y-3">
        <p className="text-sm font-medium text-zinc-200">Your UPI ID</p>
        <input
          type="text"
          value={upiId}
          onChange={(e) => onUpiIdChange(e.target.value)}
          placeholder="name@bank (e.g. rahul@okaxis)"
          maxLength={50}
          className="w-full bg-[var(--surface-raised)] text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
        />
        <p className="text-xs text-zinc-500">Others will share their bills to this UPI ID</p>
      </div>

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

      {/* Continue button */}
      <button
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full h-14 bg-[var(--brand)] hover:bg-amber-300 active:scale-95 text-black font-semibold text-base rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-40"
      >
        Continue
      </button>
    </motion.div>
  );
}

function PaymentInput({
  participantId,
  initialAmount,
  tableId,
  sessionToken,
  currencySymbol,
}: {
  participantId: string;
  initialAmount: number;
  tableId: string;
  sessionToken: string;
  currencySymbol: string;
}) {
  const [value, setValue] = useState(initialAmount > 0 ? String(initialAmount) : "");
  const pendingRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingRef.current === 0) {
      setValue(initialAmount > 0 ? String(initialAmount) : "");
    }
  }, [initialAmount]);

  function handleChange(v: string) {
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const amount = parseLocalizedNumber(v || "0");
      pendingRef.current++;
      fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ tableId, participantId, amount }),
      })
        .then((r) => { if (!r.ok) throw new Error("Failed"); })
        .catch(() => toast.error("Failed to save payment"))
        .finally(() => { pendingRef.current--; });
    }, 300);
  }

  return (
    <div className="flex items-center gap-1 bg-[var(--surface-raised)] rounded-xl px-3 py-2">
      <span className="text-zinc-400 text-sm">{currencySymbol}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="w-20 bg-transparent text-zinc-100 text-sm text-right outline-none"
      />
    </div>
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
  const { isSignedIn, user } = useUser();
  const [localSelections, setLocalSelections] = useState<Selection[] | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showShareOverlay, setShowShareOverlay] = useState(false);
  const [editingParticipantId, setEditingParticipantId] = useState<string | undefined>(undefined);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const autoJoiningRef = useRef(false);

  // Host processing state — captured while receipt OCR runs
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(null);
  const [wantTip, setWantTip] = useState(false);
  const [tipInput, setTipInput] = useState("");
  const [hostUpiId, setHostUpiId] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [hostName, setHostName] = useState("");
  const [splitsSubmitted, setSplitsSubmitted] = useState(false);

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
      // OCR just completed
      setUploadingReceipt(false);
      if (phase === "share") {
        // Already showing share sheet — skip success, keep sharing
        // User can click Continue on share sheet to go to items
      } else {
        setPhase("success");
        const t = setTimeout(() => setPhase("share"), 1000);
        return () => clearTimeout(t);
      }
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

  // Sync currency from table data when available
  useEffect(() => {
    if (data?.table?.currency) {
      setCurrency(data.table.currency);
    }
  }, [data?.table?.currency]);

  // Sync paymentMode from table data when available
  useEffect(() => {
    if (data?.table?.paymentMode) {
      setPaymentMode(data.table.paymentMode);
    }
  }, [data?.table?.paymentMode]);

  // Auto-join signed-in users (skip join modal)
  useEffect(() => {
    if (!data || session || !isSignedIn || autoJoiningRef.current) return;
    autoJoiningRef.current = true;
    const sessionToken = nanoid(32);
    const displayName = user?.fullName ?? user?.firstName ?? "You";
    fetch("/api/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId: data.table.id, displayName, sessionToken }),
    })
      .then((r) => r.json())
      .then(({ participantId }) => {
        if (participantId) {
          saveSession({ participantId, displayName, sessionToken, tableId: data.table.id });
          refresh();
        }
      })
      .catch(() => { autoJoiningRef.current = false; });
  }, [data, session, isSignedIn, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill host name from Clerk / user profile
  useEffect(() => {
    if (isSignedIn && user && !hostName) {
      setHostName(user.fullName ?? user.firstName ?? "");
    }
  }, [isSignedIn, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch user's UPI ID from profile (must be before early returns — Rules of Hooks)
  useEffect(() => {
    const hostParticipant = data?.participants?.[0];
    const isUserHost = !!session && !!hostParticipant && hostParticipant.id === session.participantId;
    if (isUserHost) {
      fetch("/api/user-profile")
        .then((res) => res.json())
        .then((profile) => {
          if (profile?.upiId) {
            setHostUpiId(profile.upiId);
          }
        })
        .catch(() => {});
    }
  }, [data, session]);

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
  const isHost = data.isHost;
  // Phase 6: Host always sees edit mode when items are ready
  const isEditing = table.status === "editing" || (isHost && table.status === "items_ready");

  const currentParticipant = session
    ? participants.find((p) => p.id === session.participantId)
    : null;
  const canEditOthers = isHost || (isSignedIn && !!currentParticipant?.userId);

  const billTotal = items.reduce((sum, i) => sum + parseFloat(i.totalPrice ?? "0"), 0);

  // Validation: all items must be selected, all payments must be filled
  const regularItems = items.filter((i) => !i.isFee);
  const unselectedItems = regularItems.filter(
    (i) => !selections.some((s) => s.itemId === i.id)
  );
  const paymentMap = new Map(data.payments.map((p) => [p.participantId, parseFloat(p.amount)]));
  const missingPayments = participants.filter(
    (p) => !paymentMap.has(p.id)
  );
  const hasAnyPayment = participants.some(
    (p) => (paymentMap.get(p.id) ?? 0) > 0
  );
  const canSettle = unselectedItems.length === 0 && missingPayments.length === 0 && hasAnyPayment;

  function handleShare() {
    if (phase === "share") return; // inline share step is already showing this UI
    setShowShareOverlay(true);
  }

  async function handleSettleClick() {
    if (!session) return;
    if (!canSettle) {
      const reasons: string[] = [];
      if (unselectedItems.length > 0) reasons.push(`Unassigned items: ${unselectedItems.map((i) => i.name).join(", ")}`);
      if (missingPayments.length > 0) reasons.push(`Missing payments from: ${missingPayments.map((p) => p.displayName).join(", ")}`);
      if (!hasAnyPayment && missingPayments.length === 0) reasons.push("At least one person must have paid");
      toast.error(reasons.length > 0 ? reasons.join(". ") : "This bill is incomplete");
      return;
    }

    // Save UPI ID to user profile if provided
    if (hostUpiId.trim()) {
      fetch("/api/user-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upiId: hostUpiId.trim() }),
      }).catch(() => {});
    }

    try {
      const res = await fetch("/api/ledger/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": session.sessionToken },
        body: JSON.stringify({ tableId: table.id, tip: hostTip }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === "unselected_items") {
          toast.error(`Unassigned items: ${err.items?.join(", ")}`);
        } else if (err.error === "missing_payments") {
          toast.error(`Missing payments from: ${err.participants?.join(", ")}`);
        } else {
          throw new Error("compute failed");
        }
        return;
      }
      router.push(`/t/${shareCode}/settle`);
    } catch {
      toast.error("Couldn't settle up, try again");
    }
  }

  function handleContinue() {
    // Save host name to profile + participant record
    if (hostName.trim() && session) {
      fetch("/api/user-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: hostName.trim() }),
      }).catch(() => {});
      fetch("/api/participants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-session-token": session.sessionToken },
        body: JSON.stringify({ displayName: hostName.trim() }),
      }).catch(() => {});
    }

    // Save currency + paymentMode to table if changed
    const updates: Record<string, string> = {};
    if (currency !== table.currency) updates.currency = currency;
    if (paymentMode && paymentMode !== table.paymentMode) updates.paymentMode = paymentMode;
    if (Object.keys(updates).length > 0) {
      fetch(`/api/tables/${shareCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-session-token": session?.sessionToken ?? "" },
        body: JSON.stringify(updates),
      }).catch(() => {});
    }

    // Always go straight to share — no processing screen
    setPhase("share");
  }

  if (table.status === "expired") {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0F0F0F] px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
          <Clock size={28} className="text-zinc-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-white font-semibold text-lg">This bill has expired</h2>
          <p className="text-zinc-500 text-sm">Bills are automatically cleared after 24 hours.</p>
        </div>
        <a
          href="/"
          className="mt-2 px-6 py-3 bg-[var(--brand)] text-black font-semibold rounded-2xl text-sm"
        >
          Start a new bill
        </a>
      </div>
    );
  }

  if (table.status === "settled") {
    router.replace(`/t/${shareCode}/settle`);
    return null;
  }

  const showItems = table.status === "items_ready" || table.status === "editing";

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
        <button
          onClick={() => setShowParticipantsList(true)}
          className="flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full bg-[var(--surface-raised)] text-zinc-300 text-xs font-medium w-fit active:scale-95 transition-transform"
        >
          <Users size={14} className="text-zinc-500" />
          {participants.length === 1
            ? "1 person in this bill"
            : `${participants.length} people in this bill`}
        </button>
      )}

      {/* Participants list sheet */}
      <AnimatePresence>
        {showParticipantsList && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
            onClick={() => setShowParticipantsList(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-[#1A1A1A] rounded-t-2xl px-4 pt-5 pb-10"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Participants</h2>
                <button
                  onClick={() => setShowParticipantsList(false)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-2">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                      p.id === session?.participantId
                        ? "bg-[var(--brand)] text-black font-medium"
                        : "bg-[var(--surface)] text-zinc-200"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        p.id === session?.participantId
                          ? "bg-black/20 text-black"
                          : "bg-zinc-700 text-zinc-200"
                      }`}
                    >
                      {p.displayName[0].toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm">{p.displayName}</span>
                    {isEditing && editingParticipantId === p.id && (
                      <Pencil size={12} className={p.id === session?.participantId ? "text-black" : "text-zinc-400"} />
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                hostName={hostName}
                onHostNameChange={setHostName}
                currency={currency}
                onCurrencyChange={setCurrency}
                paymentMode={paymentMode}
                onPaymentModeChange={setPaymentMode}
                wantTip={wantTip}
                onWantTipChange={setWantTip}
                tipInput={tipInput}
                onTipInputChange={setTipInput}
                upiId={hostUpiId}
                onUpiIdChange={setHostUpiId}
                onContinue={handleContinue}
                canContinue={!!paymentMode}
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
              onContinue={() => {
                setPhase("items");
                setShowShareOverlay(false);
              }}
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
                canEditOthers={canEditOthers}
                editingParticipantId={isEditing ? editingParticipantId : undefined}
                onEditingParticipantChange={isEditing && canEditOthers ? setEditingParticipantId : undefined}
              />
            )}

            {/* Payments section */}
            <div className="space-y-3 mt-6">
              <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">Who paid?</p>
              {participants.map((p) => {
                const canEdit = canEditOthers || p.id === session?.participantId;
                const payment = data.payments.find((pay) => pay.participantId === p.id);
                const amount = payment ? parseFloat(payment.amount) : 0;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 flex-shrink-0">
                      {p.displayName[0].toUpperCase()}
                    </div>
                    <span className="text-zinc-200 text-sm flex-1">{p.displayName}</span>
                    {isHost && p.splitsSubmittedAt && (
                      <Check size={14} className="text-emerald-400 flex-shrink-0" />
                    )}
                    {canEdit ? (
                      <PaymentInput
                        participantId={p.id}
                        initialAmount={amount}
                        tableId={table.id}
                        sessionToken={session!.sessionToken}
                        currencySymbol={getCurrencySymbol(currency)}
                      />
                    ) : (
                      <div className="flex items-center gap-1 text-sm text-zinc-300">
                        <span className="text-zinc-400">{getCurrencySymbol(currency)}</span>
                        {amount > 0 ? amount.toFixed(2) : "—"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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

      {/* Non-host submit splits / success state */}
      {showItems && !isHost && phase === "items" && (
        <>
          {splitsSubmitted || participants.find((p) => p.id === session?.participantId)?.splitsSubmittedAt ? (
            <motion.div
              key="submitted-success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0F0F0F] px-6 text-center gap-4"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="w-16 h-16 rounded-full bg-[var(--brand)]/20 flex items-center justify-center"
              >
                <Check size={32} className="text-[var(--brand)]" />
              </motion.div>
              <div className="space-y-1">
                <h2 className="text-white font-semibold text-lg">You&apos;re all set!</h2>
                <p className="text-zinc-400 text-sm">
                  Your splits are in — go relax, we&apos;ll let everyone know when it&apos;s time to settle up.
                </p>
              </div>
              <button
                onClick={() => setSplitsSubmitted(false)}
                className="mt-4 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                edit my splits
              </button>
            </motion.div>
          ) : (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0F0F0F]/90 backdrop-blur-sm border-t border-zinc-800">
              <div className="max-w-lg mx-auto">
                <button
                  onClick={async () => {
                    if (!session) return;
                    try {
                      const res = await fetch("/api/participants", {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                          "x-session-token": session.sessionToken,
                        },
                        body: JSON.stringify({ submitted: true }),
                      });
                      if (!res.ok) throw new Error("Failed");
                      setSplitsSubmitted(true);
                      refresh();
                    } catch {
                      toast.error("Failed to submit splits, try again");
                    }
                  }}
                  className="w-full h-14 bg-[var(--brand)] hover:bg-amber-300 active:scale-95 text-black font-semibold text-base rounded-2xl flex items-center justify-center gap-2 transition-all"
                >
                  Submit splits
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Share overlay — triggered by header Share button */}
      {showShareOverlay && phase !== "share" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0F0F0F] w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
            <ShareRoomSheet
              shareCode={shareCode}
              participants={participants}
              onContinue={() => setShowShareOverlay(false)}
            />
          </div>
        </div>
      )}

      {/* Join modal — only for guests (non-signed-in users) */}
      {!session && data && !isSignedIn && (
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
