# Bill edit-lock, viewable expired bills, and reopen activity history

> **Status as of 2026-08-18: not implemented.** Nothing in this document has
> shipped —  still runs, 
> does not exist, the expired dead-end is still in ,
> and there is no activity-history table, migration or endpoint. The reopen and
> close-edit routes referenced below already existed when this was written and
> are not evidence that the design landed.
>
> Line numbers cited here were correct on 2026-07-06 and have since drifted
> (the expired block moved from :530 to :549). Re-read the files before
> implementing. The problem is still live and growing: 39 of 51 bills are
> currently , so they appear in history but dead-end when opened.

## Problem

Today, a `split_tables` row (a "bill") gets a hard `status = 'expired'` flip via an
hourly Netlify cron (`netlify/functions/expire-tables.ts`) once 24 hours pass
(or an explicit `expires_at` elapses), unless it's `settled`. When a bill hits
`expired`, `app/t/[shareCode]/page.tsx` shows a dead-end screen ("This bill has
expired... start a new bill") with no way to view the bill's contents — even
though bill history already lists it.

This is too aggressive and loses data users may still want to reference. We
want:
1. Bills to remain viewable indefinitely (read-only once old).
2. A real, time-based edit cutoff (7 days) instead of an abrupt 24-hour/1-hour
   status flip.
3. Confirmation that settled bills reliably show up in bill history.
4. A small audit trail of when a host reopens a settled bill for edits, and
   when that edit session closes — shown as a "Bill activity history" button
   on the settle page.

## Current behavior (confirmed by reading the code)

- `lib/db/schema.ts`: `splitTables.status` is
  `"active" | "items_ready" | "editing" | "settled" | "expired"` with a DB
  check constraint mirroring the same values.
- `netlify/functions/expire-tables.ts` runs hourly and sets `status =
  'expired'` for any non-`expired`/non-`settled` row past its `expires_at`
  (set to `createdAt + 24h` at table creation in `app/api/tables/route.ts:20`)
  or, if `expires_at` is null, past `createdAt + 24h` directly.
- `app/t/[shareCode]/page.tsx:530` hard-blocks any `status === "expired"` bill
  with no view of its contents.
- `app/api/history/route.ts` (`fetchHistoryPage`) has **no status filter** —
  it selects `split_tables` rows where the user is `createdBy` or a
  participant, for any status, and returns them all, `expired` and `settled`
  included. No bug was found in this query during review of this design; see
  "History verification" below for how we're handling that.
- Mutation endpoints already gate on `status` per-action:
  - `app/api/selections/route.ts` (lines ~55, ~92): requires
    `editing`/`items_ready`.
  - `app/api/receipts/route.ts:128`: requires `active`.
  - `app/api/tables/[shareCode]/reopen/route.ts:29`: requires
    `settled`/`items_ready`, host-only, clears ledger/payments, sets
    `editing`.
  - `app/api/tables/[shareCode]/close-edit/route.ts:29`: requires `editing`,
    host-only, sets `items_ready`.
  - `app/api/tables/[shareCode]/route.ts` PATCH: host-only, no status gate
    today (currency/paymentMode/actualPaidTotal).
  - `app/api/ledger/compute/route.ts:113`: sets `settled` (first settle or
    re-settle after a reopen).
- The settle page (`app/t/[shareCode]/settle/page.tsx:580-597`) already has a
  host-only "Re-open bill" button that calls the reopen endpoint — this is
  the exact event we want to start logging.

## Design

### 1. Replace hard expiry with a time-based edit lock

- Delete `netlify/functions/expire-tables.ts` entirely — no more cron status
  flips.
- Add `lib/bill-lock.ts`:
  ```ts
  const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  export function isEditLocked(createdAt: Date | null): boolean {
    if (!createdAt) return false;
    return Date.now() - createdAt.getTime() >= EDIT_WINDOW_MS;
  }
  ```
- Server-side, add an `isEditLocked(table.createdAt)` check (returning 409)
  alongside the existing status checks in:
  - `selections/route.ts` (both read-checks gating POST/PATCH/DELETE)
  - `tables/[shareCode]/reopen/route.ts`
  - `tables/[shareCode]/close-edit/route.ts`
  - `tables/[shareCode]/route.ts` PATCH
  - `receipts/route.ts`
- Do **not** gate `ledger/compute` (settling) or `payments` — finalizing a
  bill and recording payments must keep working after the edit window closes;
  only editing (items, selections, currency/payment mode, reopening) locks.
- Client-side (`app/t/[shareCode]/page.tsx`, `settle/page.tsx`): remove the
  `status === "expired"` dead-end block. Compute `isLocked =
  isEditLocked(table.createdAt) || table.status === "expired"` (the latter
  covers legacy rows the old cron already flipped — they display exactly like
  any other locked, viewable bill; no data backfill needed since we stop
  writing `expired` going forward). When locked, render the normal bill view
  but disable mutation affordances (add/edit items, change selections,
  currency/payment-mode controls, "Re-open bill" button) and show a small
  banner: "Editing closed — this bill is more than a week old."
- Keep the `expired` value in the schema/check constraint (existing rows use
  it; no migration needed to remove it), it's simply never written again.

### 2. History verification (no code bug found)

Read `fetchHistoryPage` end-to-end — it filters only on `createdBy`/
participant membership, never on `status`, so settled and expired bills are
already included. Rather than speculatively patch something unproven, this
work adds regression tests (`app/api/history/route.test.ts`) asserting:
- A settled bill created by the user appears in their history.
- A settled bill the user only participated in (not created) appears.
- A legacy `expired` bill appears too.

If manual verification in the running app turns up an actual gap (e.g., a
guest-participant/userId-linking edge case), it gets fixed as part of this
same change, with a test added for the specific case found.

### 3. `bill_reopen_events` table (activity log)

New Drizzle table:
```ts
export const billReopenEvents = pgTable("bill_reopen_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id").notNull().references(() => splitTables.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id").references(() => participants.id, { onDelete: "set null" }),
  displayNameSnapshot: text("display_name_snapshot"),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }).defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedStatus: text("closed_status").$type<"items_ready" | "settled">(),
}, (t) => [index("idx_bill_reopen_events_table").on(t.tableId)]);
```
- **Created** in `reopen/route.ts`, only when the table's status *at the time
  of the call* was `settled` (not the `items_ready` branch of that route,
  which no UI path triggers today and isn't a "reopened after settling"
  event) — insert `{ tableId, participantId: host.id, displayNameSnapshot:
  host.displayName, reopenedAt: now }`.
- **Closed** by finding the open row (`tableId` match, `closedAt IS NULL`)
  and stamping `closedAt`/`closedStatus`:
  - in `close-edit/route.ts`, after flipping to `items_ready`.
  - in `ledger/compute/route.ts`, after flipping to `settled`.
  - If no open row exists (e.g. the table was never reopened), this is a
    no-op — normal first-time settle flows are unaffected.
- Migration applied with `npx drizzle-kit generate` then `npx drizzle-kit
  push` (not `migrate`), per project convention for this change.

### 4. "Bill activity history" UI

- On the settle page, add a single button below the existing content:
  "Bill activity history" (icon + label, Splitwise-style), visible whenever
  at least one `bill_reopen_events` row exists for the table (fetch via the
  existing table GET response or a small dedicated endpoint —
  implementation detail for the plan step).
- Tapping it expands/opens a simple list: one line per event, e.g. "Reopened
  by Priya · 2 days ago" and, if closed, "→ closed 3 hours later (settled)".
  No pagination needed at this scale (bounded by realistic reopen counts).

## Process for this change

1. Write implementation plan (writing-plans skill).
2. Delegate implementation to mimo (schema + backend routes + lib/bill-lock +
   UI changes), passing only file paths/schema/code — no live data, no `.env`
   (per existing mimo PII policy).
3. Delegate test-writing to mimo (route tests, lock helper unit tests, history
   regression tests).
4. Run `npx drizzle-kit generate` + `npx drizzle-kit push` to apply the new
   table.
5. Code review of the diff.
6. Merge to `main` and push.

## Out of scope

- Deleting/backfilling existing `status = 'expired'` rows.
- Any UI for editing `bill_reopen_events` retroactively.
- Locking `ledger/compute` or `payments` behind the edit window.
