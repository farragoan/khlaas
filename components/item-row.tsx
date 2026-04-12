"use client";

import { motion } from "framer-motion";
import { Price } from "@/components/price";
import type { Item, Participant } from "@/lib/db/schema";

interface ItemRowProps {
  item: Item;
  selectors: Participant[];
  isSelected: boolean;
  isFee: boolean;
  onToggle: () => void;
}

export function ItemRow({ item, selectors, isSelected, isFee, onToggle }: ItemRowProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={isFee ? undefined : onToggle}
      disabled={isFee}
      className={`
        w-full flex items-center gap-3 px-4 rounded-xl transition-colors duration-150
        min-h-[56px]
        ${isFee
          ? "bg-[var(--surface)] opacity-60 cursor-default"
          : isSelected
          ? "bg-emerald-950/50 border border-[var(--selected)]/40"
          : "bg-[var(--surface)] hover:bg-[var(--surface-raised)] active:bg-[var(--surface-raised)]"
        }
      `}
    >
      {/* Checkbox indicator */}
      {!isFee && (
        <div
          className={`
            w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors
            ${isSelected
              ? "bg-[var(--selected)] border-[var(--selected)]"
              : "border-zinc-600"
            }
          `}
        >
          {isSelected && (
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.5 8.5L11 1.5" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}

      {/* Name */}
      <span className={`flex-1 text-left text-sm font-medium ${isFee ? "text-zinc-400" : "text-zinc-100"}`}>
        {item.name}
        {item.quantity > 1 && (
          <span className="text-zinc-500 ml-1">×{item.quantity}</span>
        )}
        {isFee && <span className="ml-2 text-xs text-zinc-500">(shared fee)</span>}
      </span>

      {/* Selector avatars */}
      {selectors.length > 0 && (
        <div className="flex -space-x-1">
          {selectors.slice(0, 4).map((p) => (
            <div
              key={p.id}
              title={p.displayName}
              className="w-6 h-6 rounded-full bg-zinc-600 border border-[var(--surface)] flex items-center justify-center text-[10px] font-bold text-zinc-200 flex-shrink-0"
            >
              {p.displayName[0].toUpperCase()}
            </div>
          ))}
          {selectors.length > 4 && (
            <div className="w-6 h-6 rounded-full bg-zinc-700 border border-[var(--surface)] flex items-center justify-center text-[10px] text-zinc-400">
              +{selectors.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Price */}
      <Price
        amount={item.totalPrice ?? item.unitPrice}
        className={`text-sm ${isFee ? "text-zinc-400" : isSelected ? "text-[var(--selected)]" : "text-zinc-300"}`}
      />
    </motion.button>
  );
}
