"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Share2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useTableData } from "@/hooks/use-table-data";
import { useSession } from "@/hooks/use-session";
import { ParticipantJoin } from "@/components/participant-join";
import { ReceiptUpload } from "@/components/receipt-upload";
import { ProcessingState } from "@/components/processing-state";
import { ItemList } from "@/components/item-list";
import { PreSettleSheet } from "@/components/pre-settle-sheet";
import { CurrencyProvider } from "@/lib/currency-context";
import type { Selection } from "@/hooks/use-table-data";

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
  const isHost = participants[0]?.id === session?.participantId;

  // Bill total from items (for the mismatch warning in the pre-settle sheet)
  const billTotal = items.reduce((sum, i) => sum + parseFloat(i.totalPrice ?? "0"), 0);

  function handleShare() {
    const url = `${window.location.origin}/t/${shareCode}`;
    if (navigator.share) {
      navigator.share({ title: "Split this bill on khlaas", url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  }

  if (table.status === "settled") {
    router.replace(`/t/${shareCode}/settle`);
    return null;
  }

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
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                  p.id === session?.participantId
                    ? "bg-[var(--brand)] text-black"
                    : "bg-[var(--surface-raised)] text-zinc-300"
                }`}
              >
                {p.displayName}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <AnimatePresence mode="wait">
        {table.status === "active" && isHost && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4 pt-4"
          >
            <p className="text-zinc-400 text-sm text-center">Scan your receipt to get started</p>
            <ReceiptUpload tableId={table.id} onProcessed={refresh} />
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

        {table.status === "items_ready" && (
          <motion.div
            key="items"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <p className="text-sm text-zinc-400">Tap everything you ate</p>
            {session && (
              <ItemList
                items={items}
                participants={participants}
                selections={activeSelections}
                session={session}
                onSelectionsChange={setLocalSelections}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom bar */}
      {table.status === "items_ready" && isHost && (
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

      {/* Pre-settle sheet */}
      {showSettle && (
        <PreSettleSheet
          tableId={table.id}
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
