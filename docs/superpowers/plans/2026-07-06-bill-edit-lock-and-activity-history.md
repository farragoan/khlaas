# Bill edit-lock, viewable expired bills, and reopen activity history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 24h hard-expiry cron with a 7-day edit lock (bills stay viewable forever, only mutation stops), verify settled bills surface in history, and add a `bill_reopen_events` audit table + "Bill activity history" UI for settled→editing reopen cycles.

**Architecture:** A single `lib/bill-lock.ts` time helper gates every mutation route alongside their existing status checks. A new `bill_reopen_events` table (Drizzle) is written to only by the `reopen` route (open) and `close-edit`/`ledger/compute` routes (close). UI reads a locked/unlocked flag and an events list off the existing table-fetch response.

**Tech Stack:** Next.js route handlers, Drizzle ORM (Postgres/Neon), `drizzle-kit push` for schema sync, Vitest for tests.

## Global Constraints

- Use `npx drizzle-kit generate` then `npx drizzle-kit push` for the schema change — **not** `drizzle-kit migrate`.
- Edit lock window is exactly 7 days (`7 * 24 * 60 * 60 * 1000` ms) from `splitTables.createdAt`.
- `ledger/compute` (settling) and `payments` routes are never gated by the edit lock — only editing actions are.
- No data backfill/migration of existing `status = 'expired'` rows; the value stays in the schema/check constraint for legacy rows, just never written again.
- Full spec: `docs/superpowers/specs/2026-07-06-bill-edit-lock-and-activity-history-design.md`.

---

### Task 1: `bill-lock` helper + unit tests

**Files:**
- Create: `lib/bill-lock.ts`
- Test: `lib/bill-lock.test.ts`

**Interfaces:**
- Produces: `isEditLocked(createdAt: Date | null): boolean` — used by every route task below and by both page components in Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// lib/bill-lock.test.ts
import { describe, it, expect } from "vitest";
import { isEditLocked } from "./bill-lock";

describe("isEditLocked", () => {
  it("returns false for a bill created just now", () => {
    expect(isEditLocked(new Date())).toBe(false);
  });

  it("returns false for a bill created 6 days ago", () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    expect(isEditLocked(sixDaysAgo)).toBe(false);
  });

  it("returns true for a bill created exactly 7 days ago", () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(isEditLocked(sevenDaysAgo)).toBe(true);
  });

  it("returns true for a bill created 30 days ago", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(isEditLocked(thirtyDaysAgo)).toBe(true);
  });

  it("returns false when createdAt is null", () => {
    expect(isEditLocked(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bill-lock.test.ts`
Expected: FAIL — `lib/bill-lock.ts` does not exist / `isEditLocked` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/bill-lock.ts
const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isEditLocked(createdAt: Date | null): boolean {
  if (!createdAt) return false;
  return Date.now() - createdAt.getTime() >= EDIT_WINDOW_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bill-lock.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add lib/bill-lock.ts lib/bill-lock.test.ts
git commit -m "feat: add 7-day bill edit-lock helper"
```

---

### Task 2: `bill_reopen_events` schema + push

**Files:**
- Modify: `lib/db/schema.ts` (append new table + export type near the other tables/types)

**Interfaces:**
- Produces: `billReopenEvents` Drizzle table and `BillReopenEvent` type, consumed by Task 3 (reopen), Task 4 (close-edit / ledger compute), and Task 6 (table GET response).

- [ ] **Step 1: Add the table definition**

Add after the `payments` table definition (before `userProfiles`) in `lib/db/schema.ts`:

```ts
export const billReopenEvents = pgTable(
  "bill_reopen_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => splitTables.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").references(() => participants.id, {
      onDelete: "set null",
    }),
    displayNameSnapshot: text("display_name_snapshot"),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }).defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedStatus: text("closed_status").$type<"items_ready" | "settled">(),
  },
  (t) => [index("idx_bill_reopen_events_table").on(t.tableId)]
);
```

Add to the type exports block at the bottom of the file:

```ts
export type BillReopenEvent = typeof billReopenEvents.$inferSelect;
```

- [ ] **Step 2: Generate and push the migration**

Run: `npx drizzle-kit generate`
Expected: a new file appears under `drizzle/` (e.g. `0009_*.sql`) creating `bill_reopen_events`.

Run: `npx drizzle-kit push`
Expected: output confirms the `bill_reopen_events` table was created against `DATABASE_URL`.

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add bill_reopen_events table for reopen activity history"
```

---

### Task 3: Gate mutation routes with the edit lock

**Files:**
- Modify: `app/api/selections/route.ts:51-56` and `:88-93` (the two status-check helpers)
- Modify: `app/api/tables/[shareCode]/reopen/route.ts:19-31`
- Modify: `app/api/tables/[shareCode]/close-edit/route.ts:19-31`
- Modify: `app/api/tables/[shareCode]/route.ts` (PATCH handler, `:98-112`)
- Modify: `app/api/receipts/route.ts:122-128`
- Test: `app/api/selections/route.test.ts` (create if it doesn't exist), `app/api/tables/[shareCode]/reopen/route.test.ts` (create)

**Interfaces:**
- Consumes: `isEditLocked` from Task 1 (`lib/bill-lock.ts`).

- [ ] **Step 1: Write failing tests for the lock behavior**

```ts
// app/api/tables/[shareCode]/reopen/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTable = {
  id: "table-1",
  status: "settled",
  createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
};

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([mockTable])),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/auth", () => ({
  verifyHost: vi.fn(() => Promise.resolve({ id: "participant-1", displayName: "Host" })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ userId: "user-1" })),
}));

import { POST } from "./route";

describe("POST /api/tables/[shareCode]/reopen edit lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 409 when the bill is past the 7-day edit window", async () => {
    const req = new Request("http://localhost/api/tables/abc/reopen", {
      method: "POST",
      headers: { "x-session-token": "tok" },
    });
    const res = await POST(req, { params: Promise.resolve({ shareCode: "abc" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/edit window|locked|closed/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/tables/[shareCode]/reopen/route.test.ts`
Expected: FAIL — currently returns 200/other status, not 409, since the lock check doesn't exist yet.

- [ ] **Step 3: Add the lock check to `reopen/route.ts`**

In `app/api/tables/[shareCode]/reopen/route.ts`, after the existing status check (`if (table.status !== "settled" && table.status !== "items_ready") ...`) and its import line, add:

```ts
import { isEditLocked } from "@/lib/bill-lock";
```

```ts
  if (isEditLocked(table.createdAt)) {
    return NextResponse.json({ error: "This bill's edit window has closed" }, { status: 409 });
  }
```//

Place this check immediately after the existing status check and before the `verifyHost` call.

- [ ] **Step 4: Apply the same pattern to `close-edit/route.ts`**

Add the same import and, immediately after its `if (table.status !== "editing") ...` check, add:

```ts
  if (isEditLocked(table.createdAt)) {
    return NextResponse.json({ error: "This bill's edit window has closed" }, { status: 409 });
  }
```

- [ ] **Step 5: Apply the same pattern to `tables/[shareCode]/route.ts` PATCH**

Add the import, and immediately after the `verifyHost` check (`if (!host) { ... }`) in the `PATCH` handler, add:

```ts
  if (isEditLocked(table.createdAt)) {
    return NextResponse.json({ error: "This bill's edit window has closed" }, { status: 409 });
  }
```

- [ ] **Step 6: Apply the same pattern to `receipts/route.ts`**

Add the import, and immediately after `if (table.status !== "active") ...`, add:

```ts
  if (isEditLocked(table.createdAt)) {
    return NextResponse.json({ error: "This bill's edit window has closed" }, { status: 409 });
  }
```

Note: `receipts/route.ts`'s current `table` select only fetches `{ id, status }` (line 124) — extend that select to also fetch `createdAt`:

```ts
[table] = await db.select({ id: splitTables.id, status: splitTables.status, createdAt: splitTables.createdAt }).from(splitTables).where(eq(splitTables.id, tableId)).limit(1);
```

and update the local `table` type annotation on that line from `{ id: string; status: string }` to `{ id: string; status: string; createdAt: Date | null }`.

- [ ] **Step 7: Update the two status-check helpers in `selections/route.ts`**

In `app/api/selections/route.ts`, both helper functions (around lines 51-56 and 88-93) currently do:

```ts
  .select({ status: splitTables.status })
  ...
  if (!table || (table.status !== "editing" && table.status !== "items_ready")) return false;
```

Change both `.select({...})` calls to also select `createdAt`:

```ts
  .select({ status: splitTables.status, createdAt: splitTables.createdAt })
```

and change both boolean checks to:

```ts
  if (!table || (table.status !== "editing" && table.status !== "items_ready")) return false;
  if (isEditLocked(table.createdAt)) return false;
```

Add `import { isEditLocked } from "@/lib/bill-lock";` at the top of the file.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run app/api/tables/[shareCode]/reopen/route.test.ts`
Expected: PASS

- [ ] **Step 9: Write and run a companion test proving the lock does NOT block a fresh bill**

Add to the same test file:

```ts
it("allows reopen when the bill is within the 7-day edit window", async () => {
  mockTable.createdAt = new Date(); // fresh
  const req = new Request("http://localhost/api/tables/abc/reopen", {
    method: "POST",
    headers: { "x-session-token": "tok" },
  });
  const res = await POST(req, { params: Promise.resolve({ shareCode: "abc" }) });
  expect(res.status).toBe(200);
});
```

Run: `npx vitest run app/api/tables/[shareCode]/reopen/route.test.ts`
Expected: PASS (2/2)

- [ ] **Step 10: Commit**

```bash
git add app/api/selections/route.ts app/api/tables/[shareCode]/reopen/route.ts app/api/tables/[shareCode]/close-edit/route.ts app/api/tables/[shareCode]/route.ts app/api/receipts/route.ts app/api/tables/[shareCode]/reopen/route.test.ts
git commit -m "feat: gate bill mutation routes behind 7-day edit lock"
```

---

### Task 4: Log and close `bill_reopen_events`

**Files:**
- Modify: `app/api/tables/[shareCode]/reopen/route.ts` (insert event on settled→editing)
- Modify: `app/api/tables/[shareCode]/close-edit/route.ts` (close open event on editing→items_ready)
- Modify: `app/api/ledger/compute/route.ts` (close open event on →settled)
- Test: `app/api/tables/[shareCode]/reopen/route.test.ts` (extend), create `app/api/tables/[shareCode]/close-edit/route.test.ts`

**Interfaces:**
- Consumes: `billReopenEvents` table from Task 2.
- Produces: nothing new consumed elsewhere — this task is self-contained side effects.

- [ ] **Step 1: Write failing test asserting an event row is inserted on reopen from settled**

Add to `app/api/tables/[shareCode]/reopen/route.test.ts`, mocking `db.insert`:

```ts
it("inserts a bill_reopen_events row when reopening a settled bill", async () => {
  mockTable.status = "settled";
  mockTable.createdAt = new Date();
  const insertMock = vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) }));
  const { db } = await import("@/lib/db/client");
  (db as unknown as { insert: typeof insertMock }).insert = insertMock;

  const req = new Request("http://localhost/api/tables/abc/reopen", {
    method: "POST",
    headers: { "x-session-token": "tok" },
  });
  await POST(req, { params: Promise.resolve({ shareCode: "abc" }) });

  expect(insertMock).toHaveBeenCalled();
});
```

Update the `vi.mock("@/lib/db/client", ...)` at the top of the file to also expose a mutable `insert` and `update`/`delete` so this reassignment works — mock shape:

```ts
vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([mockTable])),
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
  },
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/tables/[shareCode]/reopen/route.test.ts`
Expected: FAIL — no insert call happens yet.

- [ ] **Step 3: Implement the insert in `reopen/route.ts`**

Add import: `import { billReopenEvents } from "@/lib/db/schema";`

After the existing `Promise.all([db.delete(ledgerEntries)..., db.delete(payments)...])` block and before/alongside the `db.update(splitTables).set({ status: "editing" })...` call, add (only when the prior status was `settled`):

```ts
  const wasSettled = table.status === "settled";

  await db
    .update(splitTables)
    .set({ status: "editing" })
    .where(eq(splitTables.id, table.id));

  if (wasSettled) {
    await db.insert(billReopenEvents).values({
      tableId: table.id,
      participantId: host.id,
      displayNameSnapshot: host.displayName,
    });
  }
```

(Capture `table.status` into `wasSettled` before the `db.update` call overwrites it in memory — `table` here is the object read at the top of the handler, so read `wasSettled` right after that select, before any mutation.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/tables/[shareCode]/reopen/route.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Write failing test for closing the event in `close-edit`**

```ts
// app/api/tables/[shareCode]/close-edit/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTable = { id: "table-1", status: "editing", createdAt: new Date() };
const mockOpenEvent = { id: "event-1", tableId: "table-1", closedAt: null };

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([mockTable])),
          orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([mockOpenEvent])) })),
        })),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
  },
}));

vi.mock("@/lib/auth", () => ({
  verifyHost: vi.fn(() => Promise.resolve({ id: "participant-1", displayName: "Host" })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ userId: "user-1" })),
}));

import { db } from "@/lib/db/client";
import { POST } from "./route";

describe("POST /api/tables/[shareCode]/close-edit closes reopen events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps closedAt/closedStatus on the open bill_reopen_events row", async () => {
    const updateMock = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) }));
    (db as unknown as { update: typeof updateMock }).update = updateMock;

    const req = new Request("http://localhost/api/tables/abc/close-edit", {
      method: "POST",
      headers: { "x-session-token": "tok" },
    });
    await POST(req, { params: Promise.resolve({ shareCode: "abc" }) });

    expect(updateMock).toHaveBeenCalledTimes(2); // once for splitTables, once for billReopenEvents
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run app/api/tables/[shareCode]/close-edit/route.test.ts`
Expected: FAIL — only one update call happens today.

- [ ] **Step 7: Implement closing logic in `close-edit/route.ts`**

Add imports: `import { billReopenEvents } from "@/lib/db/schema"; import { isNull, and, desc } from "drizzle-orm";` (merge with existing `eq` import from `drizzle-orm`).

After the existing `db.update(splitTables).set({ status: "items_ready" })...` call, add:

```ts
  const [openEvent] = await db
    .select({ id: billReopenEvents.id })
    .from(billReopenEvents)
    .where(and(eq(billReopenEvents.tableId, table.id), isNull(billReopenEvents.closedAt)))
    .orderBy(desc(billReopenEvents.reopenedAt))
    .limit(1);

  if (openEvent) {
    await db
      .update(billReopenEvents)
      .set({ closedAt: new Date(), closedStatus: "items_ready" })
      .where(eq(billReopenEvents.id, openEvent.id));
  }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run app/api/tables/[shareCode]/close-edit/route.test.ts`
Expected: PASS

- [ ] **Step 9: Add the same close-on-settle logic to `ledger/compute/route.ts`**

No new test file for this one — it's the same pattern proven in Steps 5-8, applied to a third call site; covered by the manual verification pass in Task 7. In `app/api/ledger/compute/route.ts`, add the same imports (`billReopenEvents`, `isNull`, `desc`, merge `and`/`eq` with existing `drizzle-orm` import), and immediately after the existing `.set({ status: "settled", tip: String(tip) })` update call (around line 113), add:

```ts
  const [openEvent] = await db
    .select({ id: billReopenEvents.id })
    .from(billReopenEvents)
    .where(and(eq(billReopenEvents.tableId, tableId), isNull(billReopenEvents.closedAt)))
    .orderBy(desc(billReopenEvents.reopenedAt))
    .limit(1);

  if (openEvent) {
    await db
      .update(billReopenEvents)
      .set({ closedAt: new Date(), closedStatus: "settled" })
      .where(eq(billReopenEvents.id, openEvent.id));
  }
```

(Use whatever local variable already holds the table's id at that point in the file — read the surrounding code before inserting to match the existing variable name.)

- [ ] **Step 10: Commit**

```bash
git add app/api/tables/[shareCode]/reopen/route.ts app/api/tables/[shareCode]/reopen/route.test.ts app/api/tables/[shareCode]/close-edit/route.ts app/api/tables/[shareCode]/close-edit/route.test.ts app/api/ledger/compute/route.ts
git commit -m "feat: log and close bill_reopen_events on reopen/close-edit/settle"
```

---

### Task 5: Remove the expiry cron

**Files:**
- Delete: `netlify/functions/expire-tables.ts`

- [ ] **Step 1: Delete the file**

```bash
rm netlify/functions/expire-tables.ts
```

- [ ] **Step 2: Confirm nothing else references it**

Run: `grep -rn "expire-tables" --include="*.ts" --include="*.toml" .`
Expected: no results outside of `.git`/`node_modules`. If `netlify.toml` or similar references the function by name, remove that reference too.

- [ ] **Step 3: Commit**

```bash
git add -A netlify/functions/expire-tables.ts
git commit -m "chore: remove hourly bill-expiry cron in favor of the 7-day edit lock"
```

---

### Task 6: Expose lock state + events, update bill/settle pages

**Files:**
- Modify: `app/api/tables/[shareCode]/route.ts` (GET handler — add `isLocked` and `reopenEvents` to the response)
- Modify: `app/t/[shareCode]/page.tsx:530-548` (remove hard block, add lock banner)
- Modify: `app/t/[shareCode]/settle/page.tsx` (disable "Re-open bill" when locked, add "Bill activity history" button + list)

**Interfaces:**
- Consumes: `isEditLocked` (Task 1), `billReopenEvents` (Task 2).
- Produces: GET `/api/tables/[shareCode]` response gains `isLocked: boolean` and `reopenEvents: { id: string; displayNameSnapshot: string | null; reopenedAt: string; closedAt: string | null; closedStatus: "items_ready" | "settled" | null }[]`, consumed by both page components.

- [ ] **Step 1: Extend the GET handler in `tables/[shareCode]/route.ts`**

Add imports: `import { billReopenEvents } from "@/lib/db/schema";` and `import { isEditLocked } from "@/lib/bill-lock";`.

Inside the `GET` function, alongside the existing `Promise.all([tableItems, tableParticipants])` fetch, add a fetch for events:

```ts
  const reopenEvents = await db
    .select()
    .from(billReopenEvents)
    .where(eq(billReopenEvents.tableId, table.id))
    .orderBy(desc(billReopenEvents.reopenedAt));
```

(Add `desc` to the existing `drizzle-orm` import.)

In the final `NextResponse.json({...})` call, add:

```ts
    isLocked: isEditLocked(table.createdAt) || table.status === "expired",
    reopenEvents: reopenEvents.map((e) => ({
      id: e.id,
      displayNameSnapshot: e.displayNameSnapshot,
      reopenedAt: e.reopenedAt?.toISOString() ?? null,
      closedAt: e.closedAt?.toISOString() ?? null,
      closedStatus: e.closedStatus,
    })),
```

- [ ] **Step 2: Run existing route tests to confirm nothing broke**

Run: `npx vitest run app/api/tables`
Expected: PASS (no prior tests should assert the exact shape of the GET response in a way that breaks from additive fields; if one does, update its expected object to include the new fields).

- [ ] **Step 3: Remove the hard expired-block in `app/t/[shareCode]/page.tsx`**

Replace the block at lines 530-548:

```tsx
  if (table.status === "expired") {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0F0F0F] px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
          <Clock size={28} className="text-zinc-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-white font-semibold text-lg">This bill has expired</h2>
          <p className="text-zinc-500 text-sm">Bills are automatically cleared after 24 hours.</p>
        </div>
        <a
          href="/"
          className="mt-2 px-6 py-3 bg-[var(--brand)] text-black font-semibold rounded-2xl text-sm"
        >
          Start a new bill
        </a>
      </div>
    );
  }
```

with:

```tsx
  const isLocked = table.isLocked === true;
```

Then, immediately before the `return (` of the main page JSX (the block starting `<CurrencyProvider value={currency}>`), add a locked banner that renders when `isLocked` is true. Insert it right after the header `<div className="flex items-center justify-between py-5">...</div>` block:

```tsx
      {isLocked && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-zinc-800/60 text-zinc-400 text-xs text-center">
          Editing closed — this bill is more than a week old.
        </div>
      )}
```

Every mutation-triggering control rendered further down this file (add/edit item buttons, currency/payment-mode selectors) must be passed `disabled={isLocked}` — find each such control (search this file for `onClick=` handlers that call the item/selection/table PATCH endpoints) and add the `disabled` prop, matching this component's existing prop conventions.

- [ ] **Step 4: Update the settled-redirect check to also allow locked-but-not-settled bills to render**

The existing line:

```tsx
  if (table.status === "settled") {
    router.replace(`/t/${shareCode}/settle`);
    return null;
  }
```

stays as-is — settled bills still redirect to the settle page regardless of lock state, since that page already handles read-only display for settled bills.

- [ ] **Step 5: Disable "Re-open bill" and add the activity button in `settle/page.tsx`**

Find the `{isHost && ( ... <button onClick={() => setShowReopenModal(true)}> ... Re-open bill ... )}` block (around line 580-597). Wrap the condition to also require `!isLocked`:

```tsx
        {isHost && !isLocked && (
```

(`isLocked` here comes from the same `table.isLocked` field on this page's fetched table data — add `const isLocked = table.isLocked === true;` near this page's other derived-state declarations, alongside where `isHost` is already read from the fetch response.)

Immediately after that closing `)}`, add the activity history button, gated on there being at least one event:

```tsx
        {reopenEvents.length > 0 && (
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 flex flex-col items-center"
          >
            <button
              onClick={() => setShowActivityHistory((v) => !v)}
              className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors"
            >
              Bill activity history
            </button>
            {showActivityHistory && (
              <div className="mt-3 w-full space-y-2">
                {reopenEvents.map((e) => (
                  <div key={e.id} className="text-xs text-zinc-500 bg-[var(--surface)] rounded-lg px-3 py-2">
                    Reopened by {e.displayNameSnapshot ?? "someone"} · {new Date(e.reopenedAt!).toLocaleString()}
                    {e.closedAt && (
                      <> → closed {new Date(e.closedAt).toLocaleString()} ({e.closedStatus})</>
                    )}
                  </div>
                ))}
              </div>
            )}
          </MotionDiv>
        )}
```

Add the corresponding state near this page's other `useState` declarations:

```tsx
  const [showActivityHistory, setShowActivityHistory] = useState(false);
```

And read `reopenEvents` from the table fetch response the same way `isHost`/`ledger`/etc. are already destructured on this page.

- [ ] **Step 6: Manually verify in the running app**

Run: `npm run dev`, create a bill, settle it, click "Re-open bill", confirm the activity button appears after closing edit again (via "close-edit" flow or re-settling), and confirm the listed timestamps look right. Then manually set a test row's `created_at` to 8+ days ago in the DB and confirm the page renders read-only with the lock banner instead of the old hard-block screen.

- [ ] **Step 7: Commit**

```bash
git add app/api/tables/[shareCode]/route.ts app/t/[shareCode]/page.tsx "app/t/[shareCode]/settle/page.tsx"
git commit -m "feat: viewable locked bills and bill activity history UI"
```

---

### Task 7: History regression tests

**Files:**
- Modify: `app/api/history/route.test.ts` (add cases; file already exists per the codebase)

**Interfaces:**
- Consumes: `fetchHistoryPage` (existing export from `app/api/history/route.ts`).

- [ ] **Step 1: Read the existing test file's mocking pattern**

Run: `cat app/api/history/route.test.ts` (or open it) to match its existing `db` mock shape before adding new cases — do not invent a different mocking style than what's already there.

- [ ] **Step 2: Add a failing-until-verified test for a settled bill created by the user**

Add a test case following the existing file's pattern, seeding a mock `split_tables` row with `status: "settled"` for a table the mock user created, and asserting the returned `bills` array includes an entry with `status: "settled"` for that `shareCode`.

- [ ] **Step 3: Add a test for a settled bill the user only participated in**

Same shape, but the mock table's `createdBy` is a different user id, and the mock user appears only in the `participants` mock rows for that table.

- [ ] **Step 4: Add a test for a legacy `expired` bill**

Same shape with `status: "expired"`, asserting it's still returned.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run app/api/history/route.test.ts`
Expected: PASS. If any of these fail against the real (unmodified) `fetchHistoryPage` implementation, that is the real bug referenced in the spec — fix `fetchHistoryPage` at that point (do not fix speculatively before seeing a failure) and re-run until green.

- [ ] **Step 6: Commit**

```bash
git add app/api/history/route.test.ts
git commit -m "test: verify settled and legacy-expired bills surface in history"
```

---

## Self-Review Notes

- **Spec coverage:** Edit-lock replacing expiry → Tasks 1, 3, 5, 6. History verification → Task 7. `bill_reopen_events` table + logging → Tasks 2, 4. Activity UI → Task 6. `drizzle-kit push` (not `migrate`) → Task 2. All spec sections have a task.
- **Type consistency:** `isEditLocked(createdAt: Date | null): boolean` defined once in Task 1, used identically in Tasks 3 and 6. `billReopenEvents` fields (`tableId`, `participantId`, `displayNameSnapshot`, `reopenedAt`, `closedAt`, `closedStatus`) defined in Task 2 and used with the same names in Tasks 4 and 6.
- **No placeholders:** every step shows the literal code to write or the literal command to run.
