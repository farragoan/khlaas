"use client";

import { Clock, Lock } from "lucide-react";
import { Price } from "@/components/price";
import { ByPersonView } from "@/components/by-person-view";
import type { Item, Payment, SplitTable } from "@/lib/db/schema";
import type { Selection, PublicParticipant } from "@/hooks/use-table-data";

interface ExpiredBillViewProps {
  table: SplitTable;
  items: Item[];
  participants: PublicParticipant[];
  selections: Selection[];
  payments: Payment[];
}

function byOrder(a: Item, b: Item) {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

/**
 * An expired bill is history, not a dead link. The hourly expiry job only ever
 * touches bills that were never settled, so what is on one is the last state
 * the group actually reached — worth reading back, even though it can no
 * longer move.
 *
 * Every control is absent rather than disabled. The server rejects writes to an
 * expired bill on its own, and a screen with nothing to press cannot drift out
 * of agreement with that.
 */
export function ExpiredBillView({
  table,
  items,
  participants,
  selections,
  payments,
}: ExpiredBillViewProps) {
  const regularItems = items.filter((i) => !i.isFee).sort(byOrder);
  const feeItems = items.filter((i) => i.isFee).sort(byOrder);
  const billTotal = items.reduce((sum, i) => sum + parseFloat(i.totalPrice ?? "0"), 0);

  const claimedItemIds = new Set(selections.map((s) => s.itemId));
  const unclaimed = regularItems.filter((i) => !claimedItemIds.has(i.id));

  const paidBy = new Map(payments.map((p) => [p.participantId, parseFloat(p.amount)]));
  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  return (
    <main
      className="min-h-dvh bg-[#0F0F0F] flex flex-col max-w-lg mx-auto px-4"
      style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-center justify-between py-5">
        <h1 className="text-[var(--brand)] font-bold text-xl">खल्लास</h1>
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Lock size={13} />
          View only
        </span>
      </div>

      <div className="flex items-start gap-3 bg-[var(--surface)] rounded-2xl px-4 py-3.5">
        <Clock size={18} className="text-zinc-400 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-zinc-100">This bill expired</p>
          <p className="text-xs text-zinc-500">
            Bills lock 24 hours after they&apos;re created. Everything below is
            kept as it was — it just can&apos;t be changed any more.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-12">
          This bill expired before a receipt was scanned, so there&apos;s nothing
          on it.
        </p>
      ) : (
        <div className="space-y-7 mt-6">
          <section className="space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">
              The bill
            </p>
            <div className="bg-[var(--surface)] rounded-xl divide-y divide-zinc-800">
              {regularItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="text-zinc-300 min-w-0 truncate">
                    {item.name}
                    {item.quantity > 1 && (
                      <span className="text-zinc-500"> ×{item.quantity}</span>
                    )}
                  </span>
                  <Price amount={item.totalPrice ?? "0"} className="text-zinc-400 shrink-0" />
                </div>
              ))}
              {feeItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="text-zinc-500 min-w-0 truncate">{item.name}</span>
                  <Price amount={item.totalPrice ?? "0"} className="text-zinc-500 shrink-0" />
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-zinc-200 font-medium">Total</span>
                <Price amount={billTotal} className="text-white font-semibold shrink-0" />
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">
              Who took what
            </p>
            <ByPersonView
              participants={participants}
              items={items}
              selections={selections}
            />
            {/* Unclaimed items are the usual reason a bill times out unsettled,
                so naming them explains the expiry rather than hiding it. */}
            {unclaimed.length > 0 && (
              <p className="text-xs text-zinc-500 px-1 pt-1">
                Never claimed: {unclaimed.map((i) => i.name).join(", ")}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">
              Who paid
            </p>
            <div className="bg-[var(--surface)] rounded-xl divide-y divide-zinc-800">
              {participants.map((p) => {
                const amount = paidBy.get(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="text-zinc-300 flex-1 min-w-0 truncate">
                      {p.displayName}
                    </span>
                    {amount != null && amount > 0 ? (
                      <Price amount={amount} className="text-zinc-400 shrink-0" />
                    ) : (
                      <span className="text-zinc-600 shrink-0">—</span>
                    )}
                  </div>
                );
              })}
              {totalPaid > 0 && (
                <div className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                  <span className="text-zinc-200 font-medium">Paid in total</span>
                  <Price amount={totalPaid} className="text-white font-semibold shrink-0" />
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <a
        href="/"
        className="mt-8 w-full h-12 flex items-center justify-center bg-[var(--brand)] text-black font-semibold rounded-2xl text-sm"
      >
        Start a new bill
      </a>
      <a
        href="/history"
        className="mt-3 mb-2 text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Back to your bills
      </a>
    </main>
  );
}
