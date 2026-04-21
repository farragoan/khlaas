"use client";

import { useCurrency } from "@/lib/currency-context";

interface PriceProps {
  amount: string | number;
  className?: string;
}

export function Price({ amount, className = "" }: PriceProps) {
  const currency = useCurrency();
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);

  return (
    <span
      className={`font-mono tabular-nums ${className}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {formatted}
    </span>
  );
}
