"use client";

import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { Price } from "@/components/price";
import { useCurrency, getCurrencySymbol } from "@/lib/currency-context";
import type { Item } from "@/lib/db/schema";
import type { PublicParticipant } from "@/hooks/use-table-data";

interface ItemRowProps {
  item: Item;
  selectors: PublicParticipant[];
  isSelected: boolean;
  isFee: boolean;
  onToggle: () => void;
  myQuantity?: number;
  maxQuantity?: number;
  onQuantityChange?: (quantity: number) => void;
}

export function ItemRow({
  item,
  selectors,
  isSelected,
  isFee,
  onToggle,
  myQuantity = 0,
  maxQuantity = 1,
  onQuantityChange,
}: ItemRowProps) {
  const showStepper = isSelected && item.quantity > 1 && onQuantityChange;
  const currency = useCurrency();
  const itemPrice = parseFloat(item.totalPrice ?? item.unitPrice ?? "0");

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={isFee ? undefined : showStepper ? undefined : onToggle}
      disabled={isFee}
      aria-label={`${item.name}, ${getCurrencySymbol(currency)}${itemPrice.toFixed(2)}. ${isSelected ? "Selected" : "Not selected"}`}
      className={`
        w-full flex items-center gap-3 px-4 rounded-xl transition-colors duration-150
        min-h-[56px]
        ${isFee
          ? "bg-[var(--surface)] opacity-60 cursor-default"
          : isSelected
          ? "bg-selected/10 border border-[var(--selected)]/40"
          : "bg-[var(--surface)] hover:bg-[var(--surface-raised)] active:bg-[var(--surface-raised)]"
        }
      `}
    >
      {/* Checkbox / Stepper */}
      {!isFee && (
        <>
          {showStepper ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (myQuantity <= 1) {
                    onToggle();
                  } else {
                    onQuantityChange(myQuantity - 1);
                  }
                }}
                className="w-7 h-7 rounded-md bg-surface-strong hover:bg-border/60 active:bg-border flex items-center justify-center transition-colors"
              >
                <Minus size={14} className="text-foreground" />
              </button>
              <span className="w-7 text-center text-sm font-semibold text-[var(--selected)] tabular-nums">
                {myQuantity}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (myQuantity < maxQuantity) {
                    onQuantityChange(myQuantity + 1);
                  }
                }}
                disabled={myQuantity >= maxQuantity}
                className="w-7 h-7 rounded-md bg-surface-strong hover:bg-border/60 active:bg-border flex items-center justify-center transition-colors disabled:opacity-40"
              >
                <Plus size={14} className="text-foreground" />
              </button>
            </div>
          ) : (
            <div
              className={`
                w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors
                ${isSelected
                  ? "bg-[var(--selected)] border-[var(--selected)]"
                  : "border-border"
                }
              `}
            >
              {isSelected && (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none" className="text-background">
                  <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          )}
        </>
      )}

      {/* Name */}
      <span className={`flex-1 text-left text-sm font-medium ${isFee ? "text-muted" : "text-foreground"}`}>
        {item.name}
        {item.quantity > 1 && (
          <span className="text-muted ml-1">×{item.quantity}</span>
        )}
        {isFee && <span className="ml-2 text-xs text-muted">(shared fee)</span>}
      </span>

      {/* Selector avatars */}
      {selectors.length > 0 && (
        <div className="flex -space-x-1">
          {selectors.slice(0, 4).map((p) => (
            <div
              key={p.id}
              title={p.displayName}
              aria-label={p.displayName}
              className="w-6 h-6 rounded-full bg-surface-strong border border-[var(--surface)] flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0"
            >
              {p.displayName[0].toUpperCase()}
            </div>
          ))}
          {selectors.length > 4 && (
            <div className="w-6 h-6 rounded-full bg-surface-strong border border-[var(--surface)] flex items-center justify-center text-[10px] text-foreground">
              +{selectors.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Price */}
      <Price
        amount={item.totalPrice ?? item.unitPrice}
        className={`text-sm ${isFee ? "text-muted" : isSelected ? "text-[var(--selected)]" : "text-foreground"}`}
      />
    </motion.button>
  );
}
