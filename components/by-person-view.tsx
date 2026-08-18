"use client";

import { Price } from "./price";
import type { Item } from "@/lib/db/schema";
import type { Selection, PublicParticipant } from "@/hooks/use-table-data";

interface ByPersonViewProps {
  participants: PublicParticipant[];
  items: Item[];
  selections: Selection[];
}

/**
 * The same claims as the item list, read down the other axis: one block per
 * person showing what they took. Line amounts are what that person's units of
 * an item cost, so they deliberately do not sum to what anyone owes — shared
 * fees and tax are apportioned by the ledger, not here.
 */
export function ByPersonView({ participants, items, selections }: ByPersonViewProps) {
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const claimsByParticipant = new Map<string, Selection[]>(
    participants.map((p) => [p.id, []])
  );
  for (const selection of selections) {
    claimsByParticipant.get(selection.participantId)?.push(selection);
  }

  return (
    <div className="space-y-4">
      {participants.map((participant) => {
        const claims = claimsByParticipant.get(participant.id) ?? [];
        return (
          <div key={participant.id} className="bg-[var(--surface)] rounded-xl px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-white">{participant.displayName}</p>

            {/* An empty person is information, so they stay on screen. */}
            {claims.length === 0 ? (
              <p className="text-xs text-zinc-500">Nothing yet</p>
            ) : (
              <div className="space-y-1.5">
                {claims.map((claim) => {
                  const item = itemsById.get(claim.itemId);
                  if (!item) return null;
                  return (
                    <div
                      key={claim.itemId}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="text-zinc-300 min-w-0 truncate">
                        {item.name}
                        {claim.quantity > 1 && (
                          <span className="text-zinc-500"> ×{claim.quantity}</span>
                        )}
                      </span>
                      <Price
                        amount={Number(item.unitPrice) * claim.quantity}
                        className="text-zinc-400 shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
