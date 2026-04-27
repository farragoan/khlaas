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
import { CurrencyProvider } from "@/lib/currency-context";
import type { Selection } from "@/hooks/use-table-data";

// Phase state machine for post-scan flow
// idle    = before any scan
// success = 1-second success state after OCR completes
// share   = share sheet shown (QR + invite)
// items   = item selection view
type Phase = "idle" | "success" | "share" | "items";

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

  if (table.status === "settled") {
    router.replace(`/t/${shareCode}/settle`);
    return null;
  }

  const showItems = table.status === "items_ready" || table.status === "editing";

  return (
    <CurrencyProvider value={table.currency ?? "INR"}>
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
            <p className="text-zinc-400 text-sm text-center">Scan your receipt to get started</p>
            <ReceiptUpload tableId={table.id} sessionToken={session!.sessionToken} onProcessed={refresh} />
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
              onClick={() => setShowSettle(true)}
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

      {/* Pre-settle sheet */}
      {showSettle && (
        <PreSettleSheet
          tableId={table.id}
          sessionToken={session!.sessionToken}
          participants={participants}
          billTotal={billTotal}
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
