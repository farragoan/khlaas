interface PriceProps {
  amount: string | number;
  className?: string;
}

export function Price({ amount, className = "" }: PriceProps) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return (
    <span
      className={`font-mono tabular-nums ${className}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      ₹{num.toFixed(2)}
    </span>
  );
}
