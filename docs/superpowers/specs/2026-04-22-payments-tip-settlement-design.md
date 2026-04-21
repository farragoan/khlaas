# Payments, Tip & Settlement Detail Design

_Date: 2026-04-22_

---

## Problem

The current settlement algorithm computes `net = owes - average`, which assumes all participants
paid equally. In practice, one or more people front the restaurant bill. We need to track who
paid how much, distribute a manually-entered tip, and compute `net = owes - paid` so transfers
flow correctly from under-payers to over-payers.

We also want a per-person breakdown page on the settle screen showing every dish, fee share,
tip share, amount paid, and final net.

---

## Schema Changes

### New table: `payments`

```sql
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id       UUID NOT NULL REFERENCES split_tables(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  amount         NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (table_id, participant_id)   -- one payment entry per person per bill
);
CREATE INDEX idx_payments_table ON payments(table_id);
ALTER TABLE payments REPLICA IDENTITY FULL;
```

One row per person who contributed cash. If someone didn't pay anything, no row exists for
them (or amount = 0 — the UNIQUE constraint means at most one entry per person per table).

### New column: `split_tables.tip`

```sql
ALTER TABLE split_tables ADD COLUMN tip NUMERIC(10, 2) DEFAULT 0;
```

Tip is a table-level scalar entered by the host before settling. It is distributed
proportionally across participants by food subtotal, exactly like other fees.

### No change to `ledger_entries` or `items`

The existing `is_fee = true` items (tax, service charge) stay as-is. Tip is **not** stored as
an item row — it lives on the table to keep it editable right up until settle and to separate
"receipt fees" from "added tip".

---

## Settlement Logic Changes (`lib/ledger/compute.ts`)

### Current (broken for real-world use)
```
net[pid] = owes[pid] - average
```

### New
```
net[pid] = owes[pid] - paid[pid]
```

Where:
- `owes[pid]` = food share + proportional receipt fees + proportional tip
- `paid[pid]` = amount from `payments` table (0 if no row)
- `net[pid] > 0` → this person under-paid, owes money to over-payers
- `net[pid] < 0` → this person over-paid, should receive money back

The greedy debt-simplification step (minimize transfer count) remains unchanged and operates on
the same creditor/debtor arrays — just computed from the new net formula.

`computeLedger` signature extends to accept payments and tip:

```ts
computeLedger(
  items: LedgerItem[],
  participants: LedgerParticipant[],
  selections: LedgerSelection[],
  payments: LedgerPayment[],   // NEW
  tip: number                  // NEW
): LedgerResult[]
```

### Edge case: total paid ≠ total bill

If total payments entered differ from the computed bill total, the algorithm still works
correctly — someone's net absorbs the difference. The UI warns the host if totals don't match
(yellow banner, non-blocking).

---

## API Changes

### New: `POST /api/payments`

```
Body: { tableId, participantId, amount }
Auth: X-Session-Token (must match a participant in this table)
```

Upserts a payment row (`ON CONFLICT (table_id, participant_id) DO UPDATE`).

### Updated: `POST /api/ledger/compute`

```
Body: { tableId, tip }
```

Reads payments from DB, passes them + tip into updated `computeLedger`. Saves tip to
`split_tables.tip` before computing.

### Updated: `GET /api/tables/[shareCode]`

Response gains:
```ts
{
  table: SplitTable,   // now includes tip
  items: Item[],
  participants: Participant[],
  selections: Selection[],
  payments: Payment[],   // NEW
  ledger: LedgerEntry[],
}
```

---

## UI Changes

### 1. Pre-settle sheet (new, inline on main page)

Triggered by "Settle up →". Replaces the immediate compute call with a bottom sheet:

```
┌─────────────────────────────────────┐
│  Who paid?                          │
│                                     │
│  Dhruv          ₹ [______]          │
│  Arjun          ₹ [______]          │
│  Priya          ₹ [______]          │
│                                     │
│  Tip            ₹ [______]          │
│                                     │
│  [warn: total ₹850 ≠ bill ₹800]    │
│                                     │
│  [   Settle up →   ]                │
└─────────────────────────────────────┘
```

- Numeric inputs, mobile keyboard optimised
- Real-time running total vs computed bill total
- Submit POSTs all non-zero payments then calls `/api/ledger/compute`

### 2. Settle page — "Paid by" section

Added above the transfers list:

```
PAID BY
Dhruv  ₹600     Arjun  ₹200
```

### 3. Settle page — per-person detail panel

Each `PersonTotal` row becomes tappable. Tapping slides in a detail view (CSS transform,
no navigation):

```
← Dhruv

  Butter Chicken  ×1   ₹280  (split ×2 → ₹140)
  Naan            ×3   ₹90   (split ×1 → ₹90)
  ─────────────────────────────────────
  Subtotal                    ₹230
  Tax (14.2%)                 ₹32.66
  Service (10%)               ₹23.00
  Tip (your share)            ₹18.00
  ─────────────────────────────────────
  Total owed                  ₹303.66
  You paid                    ₹600.00
  ─────────────────────────────────────
  Net: others owe you         ₹296.34
```

The detail panel gets all data it needs from the existing `useTableData` response (items +
selections + payments) — no new API call.

---

## Auth Future-Proofing Note

`participants.user_id` (nullable UUID, FK to `users.id` in V2) is the immutable internal client
code. It survives across sessions once auth is added. All ledger, payment, and selection rows
reference `participants.id` (session-scoped), but can join through to `user_id` for cross-bill
history queries in V2. **Do not collapse participant and user into one table.**

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `lib/db/schema.ts` | Add `payments` table, add `tip` to `splitTables` |
| `lib/ledger/types.ts` | Add `LedgerPayment` type |
| `lib/ledger/compute.ts` | Accept payments + tip, change net formula |
| `lib/ledger/compute.test.ts` | Update tests for new signature + new cases |
| `lib/schemas.ts` | Add `PaymentSchema`, update `ComputeLedgerSchema` |
| `app/api/payments/route.ts` | New — upsert payment |
| `app/api/ledger/compute/route.ts` | Pass payments + tip to computeLedger |
| `app/api/tables/[shareCode]/route.ts` | Include payments in response |
| `hooks/use-table-data.ts` | Add `payments` to `TableData` type |
| `app/t/[shareCode]/page.tsx` | Replace settle button with pre-settle sheet |
| `app/t/[shareCode]/settle/page.tsx` | Add "Paid by" section + tappable detail panel |
| `drizzle.config.ts` | No change |
| `docs/schema.sql` | Add payments table + tip column |
