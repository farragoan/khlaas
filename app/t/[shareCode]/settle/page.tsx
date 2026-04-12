"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Share2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useTableData } from "@/hooks/use-table-data";
import { Price } from "@/components/price";
import type { Participant, LedgerEntry } from "@/lib/db/schema";

function participantName(id: string, participants: Participant[]) {
  return participants.find((p) => p.id === id)?.displayName ?? "Unknown";
}

function PersonTotal({
  participant,
  entries,
  index,
}: {
  participant: Participant;
  entries: LedgerEntry[];
  index: number;
}) {
  const owes = entries.filter((e) => e.fromParticipant === participant.id);
  const receives = entries.filter((e) => e.toParticipant === participant.id);
  const totalOwed = owes.reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalReceives = receives.reduce((s, e) => s + parseFloat(e.amount), 0);
  const net = totalOwed - totalReceives;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: "spring", damping: 20 }}
      className="flex items-center justify-between px-4 py-4 bg-[var(--surface)] rounded-xl"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200">
          {participant.displayName[0].toUpperCase()}
        </div>
        <span className="font-medium text-zinc-100">{participant.displayName}</span>
      </div>
      <Price
        amount={Math.abs(net)}
        className={`text-base font-semibold ${net > 0.005 ? "text-[var(--danger)]" : "text-[var(--selected)]"}`}
      />
    </motion.div>
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

  if (loading || !data) {
    return (
      <div className="min-h-dvh bg-[#0F0F0F] flex items-center justify-center">
        <div className="animate-pulse text-zinc-600">Loading…</div>
      </div>
    );
  }

  const { table, participants, ledger } = data;

  if (table.status !== "settled") {
    router.replace(`/t/${shareCode}`);
    return null;
  }

  function handleShare() {
    const lines = ledger
      .map(
        (e) =>
          `${participantName(e.fromParticipant, participants)} pays ${participantName(e.toParticipant, participants)} ₹${parseFloat(e.amount).toFixed(2)}`
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
      <p className="text-zinc-400 text-sm mb-8">Here&apos;s who owes what</p>

      {/* Per-person totals */}
      <div className="space-y-2 mb-8">
        {participants.map((p, i) => (
          <PersonTotal key={p.id} participant={p} entries={ledger} index={i} />
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
  );
}
