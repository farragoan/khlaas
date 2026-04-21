# Payments, Tip & Settlement Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace average-based settlement with `net = owes - paid` using explicit per-person payment amounts, add manual tip input, and add a per-person breakdown detail panel on the settle page.

**Architecture:** Add a `payments` DB table and `tip` column; update `computeLedger` to accept payments + tip; replace the "Settle up" button with a pre-settle sheet that collects who paid what and the tip before computing; enrich the settle page with a "Paid by" section and a slide-in per-person detail panel.

**Tech Stack:** Next.js 16, Drizzle ORM, Neon (PostgreSQL), Zod, Framer Motion, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/db/schema.ts` | Modify | Add `payments` table; add `tip` to `splitTables` |
| `lib/ledger/types.ts` | Modify | Add `LedgerPayment` type |
| `lib/ledger/compute.ts` | Modify | Accept payments + tip; use `net = owes - paid` |
| `lib/ledger/compute.test.ts` | Rewrite | Tests for new formula |
| `lib/schemas.ts` | Modify | Add `PaymentSchema`; add `tip` to `ComputeLedgerSchema` |
| `app/api/payments/route.ts` | Create | Upsert a payment for one participant |
| `app/api/ledger/compute/route.ts` | Modify | Read payments from DB, pass tip + payments to `computeLedger` |
| `app/api/tables/[shareCode]/route.ts` | Modify | Return `payments` array in response |
| `hooks/use-table-data.ts` | Modify | Add `payments` to `TableData` |
| `app/t/[shareCode]/page.tsx` | Modify | Replace settle button with pre-settle sheet state |
| `components/pre-settle-sheet.tsx` | Create | Payment inputs + tip field + submit |
| `app/t/[shareCode]/settle/page.tsx` | Modify | Add "Paid by" section + tappable detail panel |
| `docs/schema.sql` | Modify | Add payments table + tip column |

---

## Task 1: Schema — add `payments` table and `tip` column

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `docs/schema.sql`

- [ ] **Add `payments` table and `tip` to `splitTables` in `lib/db/schema.ts`**

Replace the `splitTables` definition and add the `payments` table:

```ts
export const splitTables = pgTable(
  "split_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareCode: text("share_code").unique().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status")
      .notNull()
      .default("active")
      .$type<"active" | "items_ready" | "settled" | "expired">(),
    receiptUrl: text("receipt_url"),
    rawOcr: text("raw_ocr"),
    tip: numeric("tip", { precision: 10, scale: 2 }).default("0"),
  },
  (t) => [
    uniqueIndex("idx_split_tables_share_code").on(t.shareCode),
    check(
      "status_check",
      sql`${t.status} IN ('active', 'items_ready', 'settled', 'expired')`
    ),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => splitTables.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_table_participant_unique").on(t.tableId, t.participantId),
    index("idx_payments_table").on(t.tableId),
  ]
);

export type Payment = typeof payments.$inferSelect;
```

Also add `Payment` to the exports at the bottom of the file alongside the other types.

- [ ] **Push schema to Neon**

```bash
npx drizzle-kit push
```

Expected: `[✓] Changes applied` — adds `payments` table and `tip` column.

- [ ] **Update `docs/schema.sql` to match**

Add after the `ledger_entries` table definition:

```sql
-- Tracks who paid the restaurant bill and how much
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id       UUID NOT NULL REFERENCES split_tables(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  amount         NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(table_id, participant_id)
);
CREATE INDEX idx_payments_table ON payments(table_id);
ALTER TABLE payments REPLICA IDENTITY FULL;
```

And in the `split_tables` CREATE TABLE statement, add:

```sql
  tip         NUMERIC(10,2) DEFAULT 0,
```

- [ ] **Commit**

```bash
git add lib/db/schema.ts docs/schema.sql
git commit -m "feat: add payments table and tip column to split_tables"
```

---

## Task 2: Update `LedgerPayment` type and `computeLedger` function

**Files:**
- Modify: `lib/ledger/types.ts`
- Modify: `lib/ledger/compute.ts`
- Rewrite: `lib/ledger/compute.test.ts`

- [ ] **Add `LedgerPayment` to `lib/ledger/types.ts`**

```ts
export interface LedgerItem {
  id: string;
  totalPrice: string;
  isFee: boolean;
}

export interface LedgerParticipant {
  id: string;
  displayName: string;
}

export interface LedgerSelection {
  participantId: string;
  itemId: string;
}

export interface LedgerPayment {
  participantId: string;
  amount: number;
}

export interface LedgerResult {
  fromParticipant: string;
  toParticipant: string;
  amount: number;
}
```

- [ ] **Write the failing tests in `lib/ledger/compute.test.ts`**

Replace the entire file:

```ts
import { describe, it, expect } from "vitest";
import { computeLedger } from "./compute";
import type { LedgerItem, LedgerParticipant, LedgerSelection, LedgerPayment } from "./types";

const p = (id: string): LedgerParticipant => ({ id, displayName: id });
const item = (id: string, price: string, isFee = false): LedgerItem => ({ id, totalPrice: price, isFee });
const sel = (participantId: string, itemId: string): LedgerSelection => ({ participantId, itemId });
const pay = (participantId: string, amount: number): LedgerPayment => ({ participantId, amount });

describe("computeLedger", () => {
  it("one payer covers full bill — other person owes their share", () => {
    // alice ate 100, bob ate 200. alice paid 300 (full bill). bob owes alice 200.
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00")],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [pay("alice", 300)],
      0
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(200, 2);
  });

  it("two payers, three people — correct net transfers", () => {
    // alice ate 100, bob ate 200, carol ate 200. total = 500.
    // alice paid 300, bob paid 200, carol paid 0.
    // net: alice = 100-300 = -200 (creditor), bob = 200-200 = 0, carol = 200-0 = 200 (debtor)
    // carol pays alice 200
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00"), item("i3", "200.00")],
      [p("alice"), p("bob"), p("carol")],
      [sel("alice", "i1"), sel("bob", "i2"), sel("carol", "i3")],
      [pay("alice", 300), pay("bob", 200)],
      0
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("carol");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(200, 2);
  });

  it("everyone paid exactly their own share — no transfers needed", () => {
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00")],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [pay("alice", 100), pay("bob", 200)],
      0
    );
    expect(result).toHaveLength(0);
  });

  it("tip distributed proportionally to food subtotals", () => {
    // alice ate 100, bob ate 200. alice paid 360 (300 bill + 60 tip). bob paid 0.
    // tip=60: alice tip share = 60*(100/300)=20, bob tip share = 60*(200/300)=40
    // owes: alice=120, bob=240
    // net: alice = 120-360 = -240, bob = 240-0 = 240
    // bob pays alice 240
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00")],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [pay("alice", 360)],
      60
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(240, 2);
  });

  it("receipt fees (tax) distributed proportionally and included in net", () => {
    // alice ate 100, bob ate 200. tax fee = 30 (is_fee=true).
    // tax: alice = 30*(100/300)=10, bob = 30*(200/300)=20
    // owes: alice=110, bob=220. alice paid 330 total.
    // net: alice=110-330=-220, bob=220-0=220
    // bob pays alice 220
    const result = computeLedger(
      [item("i1", "100.00"), item("i2", "200.00"), item("tax", "30.00", true)],
      [p("alice"), p("bob")],
      [sel("alice", "i1"), sel("bob", "i2")],
      [pay("alice", 330)],
      0
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(220, 2);
  });

  it("shared item split equally among selectors", () => {
    // alice and bob share a 90 item. alice also ate a 30 item alone. alice paid 120.
    // owes: alice = 45+30=75, bob = 45. alice paid 120.
    // net: alice = 75-120 = -45, bob = 45-0 = 45. bob pays alice 45.
    const result = computeLedger(
      [item("shared", "90.00"), item("solo", "30.00")],
      [p("alice"), p("bob")],
      [sel("alice", "shared"), sel("bob", "shared"), sel("alice", "solo")],
      [pay("alice", 120)],
      0
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(45, 2);
  });

  it("debt minimisation — two debtors, one creditor", () => {
    // alice paid 300, bob and carol each ate 150, alice ate 0.
    // net: alice = 0-300 = -300, bob = 150, carol = 150.
    // bob pays alice 150, carol pays alice 150 (two transfers, already minimal).
    const result = computeLedger(
      [item("i1", "150.00"), item("i2", "150.00")],
      [p("alice"), p("bob"), p("carol")],
      [sel("bob", "i1"), sel("carol", "i2")],
      [pay("alice", 300)],
      0
    );
    expect(result).toHaveLength(2);
    const bobEntry = result.find((r) => r.fromParticipant === "bob");
    const carolEntry = result.find((r) => r.fromParticipant === "carol");
    expect(bobEntry?.toParticipant).toBe("alice");
    expect(bobEntry?.amount).toBeCloseTo(150, 2);
    expect(carolEntry?.toParticipant).toBe("alice");
    expect(carolEntry?.amount).toBeCloseTo(150, 2);
  });

  it("fees only with no regular items — tip split equally across all participants", () => {
    // no food, tip=40, 2 participants. alice paid 40.
    // tip fallback: equal split (grand_subtotal=0) → each 20.
    // net: alice = 20-40 = -20, bob = 20-0 = 20. bob pays alice 20.
    const result = computeLedger(
      [],
      [p("alice"), p("bob")],
      [],
      [pay("alice", 40)],
      40
    );
    expect(result).toHaveLength(1);
    expect(result[0].fromParticipant).toBe("bob");
    expect(result[0].toParticipant).toBe("alice");
    expect(result[0].amount).toBeCloseTo(20, 2);
  });
});
```

- [ ] **Run tests — verify they all fail**

```bash
npx vitest run lib/ledger/compute.test.ts
```

Expected: all 8 tests fail (wrong number of arguments to `computeLedger`).

- [ ] **Rewrite `lib/ledger/compute.ts` to implement the new formula**

```ts
import type { LedgerItem, LedgerParticipant, LedgerSelection, LedgerPayment, LedgerResult } from "./types";

export function computeLedger(
  items: LedgerItem[],
  participants: LedgerParticipant[],
  selections: LedgerSelection[],
  payments: LedgerPayment[],
  tip: number
): LedgerResult[] {
  const n = participants.length;
  if (n === 0) return [];

  const owes: Record<string, number> = {};
  for (const p of participants) owes[p.id] = 0;

  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);

  // Step 1: assign regular item costs
  for (const item of regularItems) {
    const selectors = selections
      .filter((s) => s.itemId === item.id)
      .map((s) => s.participantId);
    if (selectors.length === 0) continue;
    const share = parseFloat(item.totalPrice) / selectors.length;
    for (const pid of selectors) {
      owes[pid] = (owes[pid] ?? 0) + share;
    }
  }

  // Step 2: distribute receipt fees proportionally (by food subtotal)
  const grandSubtotal = Object.values(owes).reduce((a, b) => a + b, 0);
  const totalFees = feeItems.reduce((sum, f) => sum + parseFloat(f.totalPrice), 0);

  if (totalFees > 0) {
    for (const pid of Object.keys(owes)) {
      const proportion = grandSubtotal > 0 ? owes[pid] / grandSubtotal : 1 / n;
      owes[pid] += totalFees * proportion;
    }
  }

  // Step 3: distribute tip proportionally (by food subtotal, same as fees)
  if (tip > 0) {
    const subtotalAfterFees = grandSubtotal; // tip distributes on food subtotal, not post-fee total
    for (const pid of Object.keys(owes)) {
      const proportion = subtotalAfterFees > 0 ? (owes[pid] - (totalFees > 0 ? totalFees * (grandSubtotal > 0 ? (owes[pid] - totalFees * (grandSubtotal > 0 ? owes[pid] / grandSubtotal : 1/n)) / grandSubtotal : 1/n) : 0)) / subtotalAfterFees : 1 / n;
      owes[pid] += tip * (grandSubtotal > 0 ? (owes[pid] / (grandSubtotal + totalFees + tip - tip)) : 1 / n);
    }
  }

  // Step 4: compute net balances (net = owes - paid)
  const paid: Record<string, number> = {};
  for (const p of participants) paid[p.id] = 0;
  for (const payment of payments) {
    paid[payment.participantId] = (paid[payment.participantId] ?? 0) + payment.amount;
  }

  const net: Record<string, number> = {};
  for (const pid of Object.keys(owes)) {
    net[pid] = owes[pid] - (paid[pid] ?? 0);
  }

  // Step 5: greedy debt simplification
  const results: LedgerResult[] = [];
  const creditors = Object.entries(net)
    .filter(([, v]) => v < -0.005)
    .map(([id, v]) => ({ id, amount: -v }));
  const debtors = Object.entries(net)
    .filter(([, v]) => v > 0.005)
    .map(([id, v]) => ({ id, amount: v }));

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const payment = Math.min(creditor.amount, debtor.amount);

    results.push({
      fromParticipant: debtor.id,
      toParticipant: creditor.id,
      amount: Math.round(payment * 100) / 100,
    });

    creditor.amount -= payment;
    debtor.amount -= payment;

    if (creditor.amount < 0.005) ci++;
    if (debtor.amount < 0.005) di++;
  }

  return results;
}
```

Wait — the tip distribution logic above is overly complex and wrong. Simplify it:

Tip should distribute by **food subtotal only** (before fees), which is the `grandSubtotal` variable. Replace the entire Step 3 with:

```ts
  // Step 3: distribute tip proportionally by food subtotal
  if (tip > 0) {
    for (const pid of Object.keys(owes)) {
      // Use the food-only subtotal proportion (before fees were added in Step 2)
      // We need to recompute the food subtotal per person separately
    }
  }
```

To do this cleanly, track food subtotals separately. Here is the complete, correct implementation:

```ts
import type { LedgerItem, LedgerParticipant, LedgerSelection, LedgerPayment, LedgerResult } from "./types";

export function computeLedger(
  items: LedgerItem[],
  participants: LedgerParticipant[],
  selections: LedgerSelection[],
  payments: LedgerPayment[],
  tip: number
): LedgerResult[] {
  const n = participants.length;
  if (n === 0) return [];

  const owes: Record<string, number> = {};
  const foodSubtotal: Record<string, number> = {};
  for (const p of participants) {
    owes[p.id] = 0;
    foodSubtotal[p.id] = 0;
  }

  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);

  // Step 1: assign regular item costs
  for (const item of regularItems) {
    const selectors = selections
      .filter((s) => s.itemId === item.id)
      .map((s) => s.participantId);
    if (selectors.length === 0) continue;
    const share = parseFloat(item.totalPrice) / selectors.length;
    for (const pid of selectors) {
      owes[pid] += share;
      foodSubtotal[pid] += share;
    }
  }

  const grandFoodSubtotal = Object.values(foodSubtotal).reduce((a, b) => a + b, 0);

  // Step 2: distribute receipt fees proportionally by food subtotal
  const totalFees = feeItems.reduce((sum, f) => sum + parseFloat(f.totalPrice), 0);
  if (totalFees > 0) {
    for (const pid of Object.keys(owes)) {
      const proportion = grandFoodSubtotal > 0 ? foodSubtotal[pid] / grandFoodSubtotal : 1 / n;
      owes[pid] += totalFees * proportion;
    }
  }

  // Step 3: distribute tip proportionally by food subtotal
  if (tip > 0) {
    for (const pid of Object.keys(owes)) {
      const proportion = grandFoodSubtotal > 0 ? foodSubtotal[pid] / grandFoodSubtotal : 1 / n;
      owes[pid] += tip * proportion;
    }
  }

  // Step 4: net = owes - paid
  const paid: Record<string, number> = {};
  for (const p of participants) paid[p.id] = 0;
  for (const payment of payments) {
    paid[payment.participantId] = (paid[payment.participantId] ?? 0) + payment.amount;
  }

  const net: Record<string, number> = {};
  for (const pid of Object.keys(owes)) {
    net[pid] = owes[pid] - paid[pid];
  }

  // Step 5: greedy debt simplification
  // creditor = net < 0 (overpaid, others owe them)
  // debtor   = net > 0 (underpaid, they owe others)
  const results: LedgerResult[] = [];
  const creditors = Object.entries(net)
    .filter(([, v]) => v < -0.005)
    .map(([id, v]) => ({ id, amount: -v }));
  const debtors = Object.entries(net)
    .filter(([, v]) => v > 0.005)
    .map(([id, v]) => ({ id, amount: v }));

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const payment = Math.min(creditor.amount, debtor.amount);

    results.push({
      fromParticipant: debtor.id,
      toParticipant: creditor.id,
      amount: Math.round(payment * 100) / 100,
    });

    creditor.amount -= payment;
    debtor.amount -= payment;

    if (creditor.amount < 0.005) ci++;
    if (debtor.amount < 0.005) di++;
  }

  return results;
}
```

- [ ] **Run tests — verify they all pass**

```bash
npx vitest run lib/ledger/compute.test.ts
```

Expected: 8 tests pass.

- [ ] **Commit**

```bash
git add lib/ledger/types.ts lib/ledger/compute.ts lib/ledger/compute.test.ts
git commit -m "feat: computeLedger uses net=owes-paid with payments and tip support"
```

---

## Task 3: Add `PaymentSchema` and update `ComputeLedgerSchema`

**Files:**
- Modify: `lib/schemas.ts`

- [ ] **Update `lib/schemas.ts`**

```ts
import { z } from "zod";

export const CreateTableSchema = z.object({});

export const JoinParticipantSchema = z.object({
  tableId: z.string().uuid(),
  displayName: z.string().min(1).max(50),
  sessionToken: z.string().min(1),
});

export const AddSelectionSchema = z.object({
  participantId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const RemoveSelectionSchema = z.object({
  participantId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const ProcessReceiptSchema = z.object({
  tableId: z.string().uuid(),
  imageBase64: z.string().min(1),
});

export const PaymentSchema = z.object({
  tableId: z.string().uuid(),
  participantId: z.string().uuid(),
  amount: z.number().nonnegative(),
});

export const ComputeLedgerSchema = z.object({
  tableId: z.string().uuid(),
  tip: z.number().nonnegative().default(0),
});
```

- [ ] **Commit**

```bash
git add lib/schemas.ts
git commit -m "feat: add PaymentSchema and tip to ComputeLedgerSchema"
```

---

## Task 4: New `POST /api/payments` endpoint

**Files:**
- Create: `app/api/payments/route.ts`

- [ ] **Create `app/api/payments/route.ts`**

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { payments, participants } from "@/lib/db/schema";
import { PaymentSchema } from "@/lib/schemas";
import { and, eq } from "drizzle-orm";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = PaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tableId, participantId, amount } = parsed.data;

  // Verify participant belongs to this table
  const [participant] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.tableId, tableId)))
    .limit(1);

  if (!participant) {
    return NextResponse.json({ error: "Participant not found in this table" }, { status: 404 });
  }

  await db
    .insert(payments)
    .values({ tableId, participantId, amount: String(amount) })
    .onConflictDoUpdate({
      target: [payments.tableId, payments.participantId],
      set: { amount: String(amount) },
    });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Commit**

```bash
git add app/api/payments/route.ts
git commit -m "feat: POST /api/payments upserts payment for a participant"
```

---

## Task 5: Update `POST /api/ledger/compute` to use payments + tip

**Files:**
- Modify: `app/api/ledger/compute/route.ts`

- [ ] **Rewrite `app/api/ledger/compute/route.ts`**

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items, participants, selections, ledgerEntries, payments } from "@/lib/db/schema";
import { ComputeLedgerSchema } from "@/lib/schemas";
import { eq } from "drizzle-orm";
import { computeLedger } from "@/lib/ledger/compute";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = ComputeLedgerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tableId, tip } = parsed.data;

  const [table] = await db
    .select()
    .from(splitTables)
    .where(eq(splitTables.id, tableId))
    .limit(1);

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const [tableItems, tableParticipants, tablePayments] = await Promise.all([
    db.select().from(items).where(eq(items.tableId, tableId)),
    db.select().from(participants).where(eq(participants.tableId, tableId)),
    db.select().from(payments).where(eq(payments.tableId, tableId)),
  ]);

  const tableSelections =
    tableItems.length > 0
      ? await db
          .select({ participantId: selections.participantId, itemId: selections.itemId })
          .from(selections)
          .innerJoin(items, eq(selections.itemId, items.id))
          .where(eq(items.tableId, tableId))
      : [];

  const ledgerItems = tableItems.map((i) => ({
    id: i.id,
    totalPrice: i.totalPrice ?? "0",
    isFee: i.isFee,
  }));

  const ledgerParticipants = tableParticipants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
  }));

  const ledgerPayments = tablePayments.map((p) => ({
    participantId: p.participantId,
    amount: parseFloat(p.amount),
  }));

  const results = computeLedger(ledgerItems, ledgerParticipants, tableSelections, ledgerPayments, tip);

  // Save tip and mark table settled
  await db
    .update(splitTables)
    .set({ status: "settled", tip: String(tip) })
    .where(eq(splitTables.id, tableId));

  if (results.length > 0) {
    await db.insert(ledgerEntries).values(
      results.map((r) => ({
        tableId,
        fromParticipant: r.fromParticipant,
        toParticipant: r.toParticipant,
        amount: String(r.amount),
      }))
    );
  }

  return NextResponse.json({ ok: true, entries: results });
}
```

- [ ] **Commit**

```bash
git add app/api/ledger/compute/route.ts
git commit -m "feat: ledger/compute reads payments from DB and accepts tip"
```

---

## Task 6: Return payments from `GET /api/tables/[shareCode]` and update hook

**Files:**
- Modify: `app/api/tables/[shareCode]/route.ts`
- Modify: `hooks/use-table-data.ts`

- [ ] **Update `app/api/tables/[shareCode]/route.ts` to return payments**

Replace the entire file:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splitTables, items, participants, selections, ledgerEntries, payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  const { shareCode } = await params;

  const [table] = await db
    .select()
    .from(splitTables)
    .where(eq(splitTables.shareCode, shareCode))
    .limit(1);

  if (!table) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }

  const [tableItems, tableParticipants] = await Promise.all([
    db.select().from(items).where(eq(items.tableId, table.id)),
    db.select().from(participants).where(eq(participants.tableId, table.id)),
  ]);

  const [tableSelections, tablePayments, tableLedger] = await Promise.all([
    tableItems.length > 0
      ? db
          .select({ id: selections.id, participantId: selections.participantId, itemId: selections.itemId })
          .from(selections)
          .innerJoin(items, eq(selections.itemId, items.id))
          .where(eq(items.tableId, table.id))
      : Promise.resolve([]),
    db.select().from(payments).where(eq(payments.tableId, table.id)),
    table.status === "settled"
      ? db.select().from(ledgerEntries).where(eq(ledgerEntries.tableId, table.id))
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    table,
    items: tableItems,
    participants: tableParticipants,
    selections: tableSelections,
    payments: tablePayments,
    ledger: tableLedger,
  });
}
```

- [ ] **Update `hooks/use-table-data.ts` to include `payments`**

```ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Item, Participant, SplitTable, LedgerEntry, Payment } from "@/lib/db/schema";

export interface Selection {
  participantId: string;
  itemId: string;
}

export interface TableData {
  table: SplitTable;
  items: Item[];
  participants: Participant[];
  selections: Selection[];
  payments: Payment[];
  ledger: LedgerEntry[];
}

const POLL_INTERVAL = 2000;

export function useTableData(shareCode: string) {
  const [data, setData] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables/${shareCode}`);
      if (!res.ok) {
        setError("Table not found");
        return;
      }
      const json: TableData = await res.json();
      setData(json);
      setError(null);

      if (json.table.status === "settled" && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } catch {
      setError("Failed to load table");
    } finally {
      setLoading(false);
    }
  }, [shareCode]);

  useEffect(() => {
    fetch_();
    intervalRef.current = setInterval(fetch_, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch_]);

  return { data, error, loading, refresh: fetch_ };
}
```

- [ ] **Commit**

```bash
git add app/api/tables/[shareCode]/route.ts hooks/use-table-data.ts
git commit -m "feat: include payments in table API response and useTableData"
```

---

## Task 7: Pre-settle sheet component

**Files:**
- Create: `components/pre-settle-sheet.tsx`

This component is a bottom sheet shown when the host taps "Settle up →". It collects payment amounts per participant and an optional tip, then submits.

- [ ] **Create `components/pre-settle-sheet.tsx`**

```tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { Participant } from "@/lib/db/schema";
import { Price } from "@/components/price";

interface Props {
  tableId: string;
  participants: Participant[];
  billTotal: number;  // computed from items so we can show a warning
  onSettled: () => void;
  onClose: () => void;
}

export function PreSettleSheet({ tableId, participants, billTotal, onSettled, onClose }: Props) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(participants.map((p) => [p.id, ""]))
  );
  const [tip, setTip] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totalEntered = participants.reduce((sum, p) => {
    const v = parseFloat(amounts[p.id] || "0");
    return sum + (isNaN(v) ? 0 : v);
  }, 0) + (parseFloat(tip || "0") || 0);

  const tipAmount = parseFloat(tip || "0") || 0;
  const totalWithTip = billTotal + tipAmount;
  const mismatch = Math.abs(totalEntered - totalWithTip) > 0.5;

  async function handleSubmit() {
    const paymentEntries = participants
      .map((p) => ({ participantId: p.id, amount: parseFloat(amounts[p.id] || "0") || 0 }))
      .filter((e) => e.amount > 0);

    if (paymentEntries.length === 0) {
      toast.error("Enter at least one payment amount");
      return;
    }

    setSubmitting(true);
    try {
      // Save all non-zero payments in parallel
      await Promise.all(
        paymentEntries.map((e) =>
          fetch("/api/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tableId, participantId: e.participantId, amount: e.amount }),
          }).then((r) => { if (!r.ok) throw new Error("payment failed"); })
        )
      );

      // Compute ledger
      const res = await fetch("/api/ledger/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId, tip: tipAmount }),
      });
      if (!res.ok) throw new Error("compute failed");

      onSettled();
    } catch {
      toast.error("Couldn't settle up, try again");
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#1A1A1A] rounded-t-2xl px-4 pt-5 pb-10 max-w-lg mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle + header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Who paid?</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-200 flex-shrink-0">
                {p.displayName[0].toUpperCase()}
              </div>
              <span className="text-zinc-200 text-sm flex-1">{p.displayName}</span>
              <div className="flex items-center gap-1 bg-[var(--surface)] rounded-xl px-3 py-2">
                <span className="text-zinc-400 text-sm">₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={amounts[p.id]}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="w-20 bg-transparent text-zinc-100 text-sm text-right outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Tip row */}
        <div className="flex items-center gap-3 mb-5 pt-3 border-t border-zinc-800">
          <span className="text-zinc-400 text-sm flex-1">Tip</span>
          <div className="flex items-center gap-1 bg-[var(--surface)] rounded-xl px-3 py-2">
            <span className="text-zinc-400 text-sm">₹</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              className="w-20 bg-transparent text-zinc-100 text-sm text-right outline-none"
            />
          </div>
        </div>

        {/* Total entered vs bill total */}
        <div className={`flex justify-between text-sm mb-5 px-1 ${mismatch ? "text-amber-400" : "text-zinc-500"}`}>
          <span>Total entered</span>
          <span>
            <Price amount={totalEntered} className="inline" />
            {mismatch && (
              <span className="ml-1 text-xs">
                (bill + tip: <Price amount={totalWithTip} className="inline" />)
              </span>
            )}
          </span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-14 bg-[var(--brand)] hover:bg-amber-300 active:scale-95 text-black font-semibold text-base rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        >
          {submitting ? <Loader2 size={20} className="animate-spin" /> : "Settle up →"}
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Commit**

```bash
git add components/pre-settle-sheet.tsx
git commit -m "feat: PreSettleSheet component for payment entry before settling"
```

---

## Task 8: Wire pre-settle sheet into the main table page

**Files:**
- Modify: `app/t/[shareCode]/page.tsx`

- [ ] **Update `app/t/[shareCode]/page.tsx`**

Add import and state, replace the settle button's `onClick` with sheet toggle:

```tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Share2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useTableData } from "@/hooks/use-table-data";
import { useSession } from "@/hooks/use-session";
import { ParticipantJoin } from "@/components/participant-join";
import { ReceiptUpload } from "@/components/receipt-upload";
import { ProcessingState } from "@/components/processing-state";
import { ItemList } from "@/components/item-list";
import { PreSettleSheet } from "@/components/pre-settle-sheet";
import type { Selection } from "@/hooks/use-table-data";

export default function TablePage({
  params,
}: {
  params: Promise<{ shareCode: string }>;
}) {
  const { shareCode } = use(params);
  const router = useRouter();
  const { data, error, loading, refresh } = useTableData(shareCode);
  const { session, saveSession } = useSession(data?.table?.id ?? null);
  const [localSelections, setLocalSelections] = useState<Selection[] | null>(null);
  const [showSettle, setShowSettle] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0F0F0F]">
        <Loader2 className="animate-spin text-zinc-600" size={32} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0F0F0F]">
        <p className="text-zinc-400">Table not found</p>
      </div>
    );
  }

  const { table, items, participants, selections } = data;
  const activeSelections = localSelections ?? selections;
  const isHost = participants[0]?.id === session?.participantId;

  // Bill total from items (for the pre-settle warning)
  const billTotal = items.reduce((sum, i) => sum + parseFloat(i.totalPrice ?? "0"), 0);

  function handleShare() {
    const url = `${window.location.origin}/t/${shareCode}`;
    if (navigator.share) {
      navigator.share({ title: "Split this bill on khlaas", url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  }

  if (table.status === "settled") {
    router.replace(`/t/${shareCode}/settle`);
    return null;
  }

  return (
    <main className="min-h-dvh bg-[#0F0F0F] flex flex-col max-w-lg mx-auto px-4 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between py-5">
        <h1 className="text-[var(--brand)] font-bold text-xl">खल्लास</h1>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Share2 size={16} />
          Share
        </button>
      </div>

      {/* Participants strip */}
      {participants.length > 0 && (
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
          <Users size={14} className="text-zinc-500 flex-shrink-0" />
          <div className="flex gap-2">
            {participants.map((p) => (
              <motion.div
                key={p.id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 18 }}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                  p.id === session?.participantId
                    ? "bg-[var(--brand)] text-black"
                    : "bg-[var(--surface-raised)] text-zinc-300"
                }`}
              >
                {p.displayName}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <AnimatePresence mode="wait">
        {table.status === "active" && isHost && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4 pt-4"
          >
            <p className="text-zinc-400 text-sm text-center">Scan your receipt to get started</p>
            <ReceiptUpload tableId={table.id} onProcessed={refresh} />
          </motion.div>
        )}

        {table.status === "active" && !isHost && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-4"
          >
            <p className="text-zinc-400 text-sm text-center mb-6">
              Waiting for the host to scan the receipt…
            </p>
            <ProcessingState />
          </motion.div>
        )}

        {table.status === "items_ready" && (
          <motion.div
            key="items"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <p className="text-sm text-zinc-400">Tap everything you ate</p>
            {session && (
              <ItemList
                items={items}
                participants={participants}
                selections={activeSelections}
                session={session}
                onSelectionsChange={setLocalSelections}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom bar */}
      {table.status === "items_ready" && isHost && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0F0F0F]/90 backdrop-blur-sm border-t border-zinc-800">
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setShowSettle(true)}
              className="w-full h-14 bg-[var(--brand)] hover:bg-amber-300 active:scale-95 text-black font-semibold text-base rounded-2xl flex items-center justify-center gap-2 transition-all"
            >
              Settle up →
            </button>
          </div>
        </div>
      )}

      {/* Pre-settle sheet */}
      {showSettle && (
        <PreSettleSheet
          tableId={table.id}
          participants={participants}
          billTotal={billTotal}
          onSettled={() => router.push(`/t/${shareCode}/settle`)}
          onClose={() => setShowSettle(false)}
        />
      )}

      {/* Join modal */}
      {!session && data && (
        <ParticipantJoin
          tableId={table.id}
          onJoined={(s) => {
            saveSession(s);
            refresh();
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Commit**

```bash
git add app/t/[shareCode]/page.tsx
git commit -m "feat: wire PreSettleSheet into table page"
```

---

## Task 9: Update settle page — "Paid by" section and per-person detail panel

**Files:**
- Modify: `app/t/[shareCode]/settle/page.tsx`

- [ ] **Rewrite `app/t/[shareCode]/settle/page.tsx`**

```tsx
"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useTableData } from "@/hooks/use-table-data";
import { Price } from "@/components/price";
import type { Participant, LedgerEntry, Payment, Item } from "@/lib/db/schema";
import type { Selection } from "@/hooks/use-table-data";

function participantName(id: string, participants: Participant[]) {
  return participants.find((p) => p.id === id)?.displayName ?? "Unknown";
}

function PersonDetail({
  participant,
  items,
  selections,
  payments,
  tip,
  onClose,
}: {
  participant: Participant;
  items: Item[];
  selections: Selection[];
  payments: Payment[];
  tip: number;
  onClose: () => void;
}) {
  const mySelections = selections.filter((s) => s.participantId === participant.id);
  const myItemIds = new Set(mySelections.map((s) => s.itemId));

  const regularItems = items.filter((i) => !i.isFee);
  const feeItems = items.filter((i) => i.isFee);

  // Food subtotals for proportional fee/tip distribution
  const allFoodSubtotals: Record<string, number> = {};
  for (const item of regularItems) {
    const selectors = selections.filter((s) => s.itemId === item.id);
    if (selectors.length === 0) continue;
    const share = parseFloat(item.totalPrice ?? "0") / selectors.length;
    for (const s of selectors) {
      allFoodSubtotals[s.participantId] = (allFoodSubtotals[s.participantId] ?? 0) + share;
    }
  }
  const grandFoodSubtotal = Object.values(allFoodSubtotals).reduce((a, b) => a + b, 0);
  const myFoodSubtotal = allFoodSubtotals[participant.id] ?? 0;
  const proportion = grandFoodSubtotal > 0 ? myFoodSubtotal / grandFoodSubtotal : 0;

  const totalFees = feeItems.reduce((s, f) => s + parseFloat(f.totalPrice ?? "0"), 0);
  const myFeeShare = totalFees * proportion;
  const myTipShare = tip * proportion;

  const myFoodRows = regularItems
    .filter((i) => myItemIds.has(i.id))
    .map((i) => {
      const selectors = selections.filter((s) => s.itemId === i.id).length;
      const myShare = parseFloat(i.totalPrice ?? "0") / selectors;
      return { name: i.name, quantity: i.quantity, total: parseFloat(i.totalPrice ?? "0"), myShare, selectors };
    });

  const totalOwed = myFoodSubtotal + myFeeShare + myTipShare;
  const paid = parseFloat(payments.find((p) => p.participantId === participant.id)?.amount ?? "0");
  const net = totalOwed - paid;

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="fixed inset-0 bg-[#0F0F0F] z-50 flex flex-col max-w-lg mx-auto px-4 pb-16 overflow-y-auto"
    >
      <div className="flex items-center gap-3 py-5">
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
          <ChevronLeft size={24} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200">
            {participant.displayName[0].toUpperCase()}
          </div>
          <span className="text-white font-semibold">{participant.displayName}</span>
        </div>
      </div>

      {/* Food items */}
      <div className="space-y-2 mb-4">
        {myFoodRows.length === 0 && (
          <p className="text-zinc-500 text-sm py-4 text-center">No items selected</p>
        )}
        {myFoodRows.map((row, i) => (
          <div key={i} className="flex items-start justify-between text-sm">
            <div>
              <span className="text-zinc-200">{row.name}</span>
              {row.selectors > 1 && (
                <span className="text-zinc-500 ml-1 text-xs">÷{row.selectors}</span>
              )}
            </div>
            <Price amount={row.myShare} className="text-zinc-300" />
          </div>
        ))}
      </div>

      {/* Fees + tip */}
      <div className="border-t border-zinc-800 pt-3 space-y-2 mb-4">
        {feeItems.map((f) => (
          <div key={f.id} className="flex justify-between text-sm">
            <span className="text-zinc-400">{f.name}</span>
            <Price amount={parseFloat(f.totalPrice ?? "0") * proportion} className="text-zinc-400" />
          </div>
        ))}
        {myTipShare > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Tip (your share)</span>
            <Price amount={myTipShare} className="text-zinc-400" />
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Total owed</span>
          <Price amount={totalOwed} className="text-zinc-200 font-medium" />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">You paid</span>
          <Price amount={paid} className="text-[var(--selected)] font-medium" />
        </div>
        <div className="flex justify-between text-base font-semibold pt-1 border-t border-zinc-800">
          <span className={net > 0.005 ? "text-[var(--danger)]" : "text-[var(--selected)]"}>
            {net > 0.005 ? "Still owes" : net < -0.005 ? "Gets back" : "Settled"}
          </span>
          {Math.abs(net) > 0.005 && (
            <Price amount={Math.abs(net)} className={net > 0.005 ? "text-[var(--danger)]" : "text-[var(--selected)]"} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function PersonTotal({
  participant,
  entries,
  index,
  onClick,
}: {
  participant: Participant;
  entries: LedgerEntry[];
  index: number;
  onClick: () => void;
}) {
  const owes = entries.filter((e) => e.fromParticipant === participant.id);
  const receives = entries.filter((e) => e.toParticipant === participant.id);
  const totalOwed = owes.reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalReceives = receives.reduce((s, e) => s + parseFloat(e.amount), 0);
  const net = totalOwed - totalReceives;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: "spring", damping: 20 }}
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-4 bg-[var(--surface)] rounded-xl active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200">
          {participant.displayName[0].toUpperCase()}
        </div>
        <div className="text-left">
          <span className="font-medium text-zinc-100 block">{participant.displayName}</span>
          <span className="text-xs text-zinc-500">Tap for breakdown</span>
        </div>
      </div>
      <Price
        amount={Math.abs(net)}
        className={`text-base font-semibold ${net > 0.005 ? "text-[var(--danger)]" : "text-[var(--selected)]"}`}
      />
    </motion.button>
  );
}

export default function SettlePage({
  params,
}: {
  params: Promise<{ shareCode: string }>;
}) {
  const { shareCode } = use(params);
  const router = useRouter();
  const { data, loading } = useTableData(shareCode);
  const [detailParticipant, setDetailParticipant] = useState<Participant | null>(null);

  if (loading || !data) {
    return (
      <div className="min-h-dvh bg-[#0F0F0F] flex items-center justify-center">
        <div className="animate-pulse text-zinc-600">Loading…</div>
      </div>
    );
  }

  const { table, participants, ledger, payments, items, selections } = data;
  const tip = parseFloat(table.tip ?? "0");

  if (table.status !== "settled") {
    router.replace(`/t/${shareCode}`);
    return null;
  }

  function handleShare() {
    const lines = ledger
      .map(
        (e) =>
          `${participantName(e.fromParticipant, participants)} pays ${participantName(e.toParticipant, participants)} ₹${parseFloat(e.amount).toFixed(2)}`
      )
      .join("\n");
    const text = `Bill settled via khlaas:\n${lines}`;
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Summary copied!");
    }
  }

  return (
    <>
      <main className="min-h-dvh bg-[#0F0F0F] flex flex-col max-w-lg mx-auto px-4 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between py-5">
          <button
            onClick={() => router.push(`/t/${shareCode}`)}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-[var(--brand)] font-bold text-xl">खल्लास</h1>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Share2 size={16} />
            Share
          </button>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white mb-2"
        >
          All settled ✓
        </motion.h2>
        <p className="text-zinc-400 text-sm mb-6">Tap a person to see their breakdown</p>

        {/* Paid by */}
        {payments.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-zinc-500 uppercase tracking-wider px-1 mb-2">Paid by</p>
            <div className="flex flex-wrap gap-2">
              {payments.map((pay) => (
                <div
                  key={pay.id}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)] rounded-xl text-sm"
                >
                  <span className="font-medium text-zinc-200">
                    {participantName(pay.participantId, participants)}
                  </span>
                  <Price amount={pay.amount} className="text-[var(--selected)]" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-person totals */}
        <div className="space-y-2 mb-8">
          {participants.map((p, i) => (
            <PersonTotal
              key={p.id}
              participant={p}
              entries={ledger}
              index={i}
              onClick={() => setDetailParticipant(p)}
            />
          ))}
        </div>

        {/* Transfer list */}
        {ledger.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider px-1">Transfers needed</p>
            {ledger.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className="flex items-center gap-2 px-4 py-3 bg-[var(--surface-raised)] rounded-xl text-sm"
              >
                <span className="font-medium text-zinc-200">
                  {participantName(entry.fromParticipant, participants)}
                </span>
                <span className="text-zinc-500">pays</span>
                <span className="font-medium text-zinc-200">
                  {participantName(entry.toParticipant, participants)}
                </span>
                <Price amount={entry.amount} className="ml-auto text-[var(--brand)]" />
              </motion.div>
            ))}
          </div>
        )}

        {ledger.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-zinc-500 text-center py-8"
          >
            Everyone&apos;s even — no transfers needed
          </motion.p>
        )}
      </main>

      {/* Per-person detail panel */}
      <AnimatePresence>
        {detailParticipant && (
          <PersonDetail
            participant={detailParticipant}
            items={items}
            selections={selections}
            payments={payments}
            tip={tip}
            onClose={() => setDetailParticipant(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Commit**

```bash
git add app/t/[shareCode]/settle/page.tsx
git commit -m "feat: settle page with paid-by section and per-person detail panel"
```

---

## Task 10: Netlify deployment config

**Files:**
- Create: `netlify.toml`

- [ ] **Install `@netlify/plugin-nextjs`**

```bash
npm install --save-dev @netlify/plugin-nextjs
```

- [ ] **Create `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[build.environment]
  NODE_VERSION = "20"
```

- [ ] **Commit**

```bash
git add netlify.toml package.json package-lock.json
git commit -m "chore: add Netlify deployment config with Next.js plugin"
```

- [ ] **Prompt user to deploy manually**

Netlify deployment requires connecting the repo via the Netlify dashboard. Prompt the user:

> Netlify config is ready. To deploy:
> 1. Go to app.netlify.com → "Add new site" → "Import an existing project"
> 2. Connect your GitHub repo
> 3. Build command: `npm run build`, Publish directory: `.next`
> 4. Add environment variables: `DATABASE_URL`, `GOOGLE_AI_STUDIO_API_KEY`, `USE_OPENROUTER` (optional)
> 5. Click Deploy

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| `payments` table + `tip` column | Task 1 |
| `LedgerPayment` type | Task 2 |
| `net = owes - paid` formula | Task 2 |
| Tip distributed proportionally | Task 2 |
| `POST /api/payments` | Task 4 |
| `ComputeLedgerSchema` with tip | Task 3 |
| `/api/ledger/compute` reads payments | Task 5 |
| `/api/tables/[shareCode]` returns payments | Task 6 |
| `useTableData` includes payments | Task 6 |
| Pre-settle sheet UI | Task 7 |
| "Paid by" section on settle page | Task 9 |
| Per-person detail panel | Task 9 |
| Auth future-proofing (doc only) | Spec doc |
| Netlify deployment | Task 10 |

**Type consistency check:**

- `LedgerPayment` defined in Task 2, used in `computeLedger` (Task 2) and `ledger/compute/route.ts` (Task 5) ✅
- `Payment` type exported from `lib/db/schema.ts` (Task 1), imported in hook (Task 6) and settle page (Task 9) ✅
- `table.tip` added in Task 1, read as `parseFloat(table.tip ?? "0")` in Task 9 ✅
- `PreSettleSheet` created in Task 7, imported in Task 8 ✅

**Placeholder scan:** No TBDs, no "implement later", all code blocks complete ✅
