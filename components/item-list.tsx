"use client";

import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { toast } from "sonner";
import { ItemRow } from "./item-row";
import type { Item } from "@/lib/db/schema";
import type { Selection, PublicParticipant } from "@/hooks/use-table-data";
import type { Session } from "@/hooks/use-session";

interface ItemListProps {
  items: Item[];
  participants: PublicParticipant[];
  selections: Selection[];
  session: Session;
  onSelectionsChange: (selections: Selection[]) => void;
  isEditMode?: boolean;
  isHost?: boolean;
  editingParticipantId?: string;
  onEditingParticipantChange?: (id: string) => void;
}

export function ItemList({
  items,
  participants,
  selections,
  session,
  onSelectionsChange,
  isEditMode = false,
  isHost = false,
  editingParticipantId,
  onEditingParticipantChange,
}: ItemListProps) {
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const [localSelections, setLocalSelections] = useState<Selection[]>(selections);

  // The participant whose selections we're viewing/editing
  const activeParticipantId = editingParticipantId ?? session.participantId;

  // Count of in-flight toggle requests — poll must not overwrite while pending
  const pendingRef = useRef(0);

  // Sync external selections (from polling) into local state, but skip if a
  // toggle is still in flight to avoid clobbering the optimistic update
  const latestExternal = useRef(selections);
  useEffect(() => {
    latestExternal.current = selections;
    if (pendingRef.current === 0) {
      setLocalSelections(selections);
    }
  }, [selections]);

  const regularItems = items.filter((i) => !i.isFee).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const feeItems = items.filter((i) => i.isFee).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  function isSelected(itemId: string) {
    return localSelections.some(
      (s) => s.itemId === itemId && s.participantId === activeParticipantId
    );
  }

  function getMyQuantity(itemId: string): number {
    const sel = localSelections.find(
      (s) => s.itemId === itemId && s.participantId === activeParticipantId
    );
    return sel?.quantity ?? 0;
  }

  function getOtherAllocated(itemId: string): number {
    return localSelections
      .filter((s) => s.itemId === itemId && s.participantId !== activeParticipantId)
      .reduce((sum, s) => sum + s.quantity, 0);
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

    if (selected) {
      // Deselect: remove
      const next = localSelections.filter(
        (s) => !(s.itemId === item.id && s.participantId === activeParticipantId)
      );
      setLocalSelections(next);
      onSelectionsChange(next);

      pendingRef.current++;
      try {
        const res = await fetch("/api/selections", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": session.sessionToken,
          },
          body: JSON.stringify({ participantId: activeParticipantId, itemId: item.id }),
        });
        if (!res.ok) throw new Error("Failed");
      } catch {
        setLocalSelections(prev);
        onSelectionsChange(prev);
        toast.error("Couldn't update selection, try again");
      } finally {
        pendingRef.current--;
        if (pendingRef.current === 0) {
          setLocalSelections(latestExternal.current);
          onSelectionsChange(latestExternal.current);
        }
      }
    } else {
      // Select: add with quantity 1
      const next = [...localSelections, { itemId: item.id, participantId: activeParticipantId, quantity: 1 }];
      setLocalSelections(next);
      onSelectionsChange(next);

      pendingRef.current++;
      try {
        const res = await fetch("/api/selections", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": session.sessionToken,
          },
          body: JSON.stringify({ participantId: activeParticipantId, itemId: item.id, quantity: 1 }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Failed");
        }
      } catch (e) {
        setLocalSelections(prev);
        onSelectionsChange(prev);
        toast.error(e instanceof Error ? e.message : "Couldn't update selection, try again");
      } finally {
        pendingRef.current--;
        if (pendingRef.current === 0) {
          setLocalSelections(latestExternal.current);
          onSelectionsChange(latestExternal.current);
        }
      }
    }
  }

  async function updateQuantity(item: Item, newQuantity: number) {
    const prev = localSelections;

    // Optimistic update
    const next = localSelections.map((s) =>
      s.itemId === item.id && s.participantId === activeParticipantId
        ? { ...s, quantity: newQuantity }
        : s
    );
    setLocalSelections(next);
    onSelectionsChange(next);

    pendingRef.current++;
    try {
      const res = await fetch("/api/selections", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": session.sessionToken,
        },
        body: JSON.stringify({ participantId: activeParticipantId, itemId: item.id, quantity: newQuantity }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed");
      }
    } catch (e) {
      setLocalSelections(prev);
      onSelectionsChange(prev);
      toast.error(e instanceof Error ? e.message : "Couldn't update quantity, try again");
    } finally {
      pendingRef.current--;
      if (pendingRef.current === 0) {
        setLocalSelections(latestExternal.current);
        onSelectionsChange(latestExternal.current);
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Host participant switcher (edit mode only) */}
      {isEditMode && isHost && participants.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">Editing for</p>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <button
                key={p.id}
                onClick={() => onEditingParticipantChange?.(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  p.id === activeParticipantId
                    ? "bg-[var(--brand)] text-black"
                    : "bg-[var(--surface-raised)] text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {p.displayName}
                {p.id === session.participantId && " (you)"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Non-host in edit mode: show whose context is active */}
      {isEditMode && !isHost && (
        <p className="text-xs text-zinc-500 text-center">
          Editing your selections — host will close edit mode when ready
        </p>
      )}

      <div ref={listRef} className="space-y-2">
        {regularItems.map((item) => {
          const myQty = getMyQuantity(item.id);
          const otherAllocated = getOtherAllocated(item.id);
          const maxAvailable = item.quantity - otherAllocated;
          return (
            <ItemRow
              key={item.id}
              item={item}
              selectors={selectorsFor(item.id)}
              isSelected={isSelected(item.id)}
              isFee={false}
              onToggle={() => toggle(item)}
              myQuantity={myQty}
              maxQuantity={maxAvailable}
              onQuantityChange={(qty) => updateQuantity(item, qty)}
            />
          );
        })}
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
