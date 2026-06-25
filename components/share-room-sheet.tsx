"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { Copy, Share2, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import type { PublicParticipant } from "@/hooks/use-table-data";

const QRCodeSVG = lazy(() =>
  import("qrcode.react").then((m) => ({ default: m.QRCodeSVG }))
);

interface ShareRoomSheetProps {
  shareCode: string;
  participants: PublicParticipant[];
  onContinue: () => void;
}

export function ShareRoomSheet({ shareCode, participants, onContinue }: ShareRoomSheetProps) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const roomUrl = origin ? `${origin}/t/${shareCode}` : "";

  function handleCopy() {
    if (!roomUrl) return;
    navigator.clipboard.writeText(roomUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShare() {
    if (!roomUrl) return;
    if (navigator.share) {
      navigator.share({ title: "Join my bill on खल्लास", url: roomUrl });
    } else {
      handleCopy();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center text-center pt-6 pb-4"
    >
      <p className="text-zinc-400 text-sm mb-6">Invite everyone before you start tapping</p>

      {/* QR Code */}
      {roomUrl && (
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="rounded-2xl overflow-hidden mb-5 p-3 bg-[#0F0F0F] border border-zinc-800"
        >
          <Suspense fallback={<div className="w-[200px] h-[200px] bg-zinc-800 rounded" />}>
            <QRCodeSVG
              value={roomUrl}
              size={200}
              fgColor="#fbbf24"
              bgColor="#0F0F0F"
              level="M"
            />
          </Suspense>
        </motion.div>
      )}

      {/* Room code */}
      <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Room code</p>
      <p className="text-white font-mono text-2xl font-bold tracking-wider mb-6">{shareCode}</p>

      {/* Copy / Share buttons */}
      <div className="flex gap-3 w-full mb-6">
        <button
          onClick={handleCopy}
          className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl bg-[var(--surface)] text-zinc-300 text-sm font-medium hover:bg-zinc-700 active:scale-95 transition-all"
        >
          {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={handleShare}
          className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl bg-[var(--surface)] text-zinc-300 text-sm font-medium hover:bg-zinc-700 active:scale-95 transition-all"
        >
          <Share2 size={16} />
          Share
        </button>
      </div>

      {/* Live participant dots */}
      <div className="mb-8">
        <p className="text-zinc-500 text-xs mb-3">Waiting for others…</p>
        <div className="flex items-center gap-2 justify-center flex-wrap">
          {participants.map((p) => (
            <motion.div
              key={p.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 14 }}
              className="flex flex-col items-center gap-1"
            >
              <div className="w-9 h-9 rounded-full bg-[var(--brand)] flex items-center justify-center text-sm font-bold text-black">
                {p.displayName[0].toUpperCase()}
              </div>
              <span className="text-zinc-400 text-[10px] max-w-[48px] truncate">{p.displayName}</span>
            </motion.div>
          ))}
          {/* Ghost dots for empty slots */}
          {[...Array(Math.max(0, 3 - participants.length))].map((_, i) => (
            <div key={`ghost-${i}`} className="w-9 h-9 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
            </div>
          ))}
        </div>
      </div>

      {/* Continue button */}
      <button
        onClick={onContinue}
        className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] text-black font-semibold text-base active:scale-95 transition-all hover:bg-amber-300"
      >
        Continue to bill
        <ArrowRight size={18} />
      </button>
    </motion.div>
  );
}
