"use client";

import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { toast } from "sonner";
import { ItemRow } from "./item-row";
import type { Item, Participant } from "@/lib/db/schema";
import type { Selection } from "@/hooks/use-table-data";
import type { Session } from "@/hooks/use-session";

interface ItemListProps {
  items: Item[];
  participants: Participant[];
  selections: Selection[];
  session: Session;
  onSelectionsChange: (selections: Selection[]) => void;
}

export function ItemList({ items, participants, selections, session, onSelectionsChange }: ItemListProps) {
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const [localSelections, setLocalSelections] = useState<Selection[]>(selections);

  // Sync external selections (from polling) into local state
  const latestExternal = useRef(selections);
  useEffect(() => {
    latestExternal.current = selections;
    setLocalSelections(selections);
  }, [selections]);

  const regularItems = items.filter((i) => !i.isFee).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const feeItems = items.filter((i) => i.isFee).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  function isSelected(itemId: string) {
    return localSelections.some(
      (s) => s.itemId === itemId && s.participantId === session.participantId
    );
  }

  function selectorsFor(itemId: string) {
    const ids = localSelections
      .filter((s) => s.itemId === itemId)
      .map((s) => s.participantId);
    return participants.filter((p) => ids.includes(p.id));
  }

  async function toggle(item: Item) {
    const selected = isSelected(item.id);
    const prev = localSelections;

    // Optimistic update
    if (selected) {
      const next = localSelections.filter(
        (s) => !(s.itemId === item.id && s.participantId === session.participantId)
      );
      setLocalSelections(next);
      onSelectionsChange(next);
    } else {
      const next = [...localSelections, { itemId: item.id, participantId: session.participantId }];
      setLocalSelections(next);
      onSelectionsChange(next);
    }

    try {
      const res = await fetch("/api/selections", {
        method: selected ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": session.sessionToken,
        },
        body: JSON.stringify({ participantId: session.participantId, itemId: item.id }),
      });

      if (!res.ok) throw new Error("Failed");
    } catch {
      // Revert on error
      setLocalSelections(prev);
      onSelectionsChange(prev);
      toast.error("Couldn't update selection, try again");
    }
  }

  return (
    <div className="space-y-6">
      <div ref={listRef} className="space-y-2">
        {regularItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            selectors={selectorsFor(item.id)}
            isSelected={isSelected(item.id)}
            isFee={false}
            onToggle={() => toggle(item)}
          />
        ))}
      </div>

      {feeItems.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 px-1 uppercase tracking-wider">Shared fees</p>
          <div className="space-y-2">
            {feeItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                selectors={[]}
                isSelected={false}
                isFee={true}
                onToggle={() => {}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
