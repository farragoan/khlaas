# Feature: discount / actual-amount-paid toggle (replaces "I paid" input)

## Context
`PaymentInput` in `app/t/[shareCode]/page.tsx` (lines ~214-267) is a debounced numeric input per participant that PUTs `{tableId, participantId, amount}` to `POST /api/payments` (upsert on `[tableId, participantId]`). `lib/ledger/compute.ts`'s `computeLedger` allocates item costs by selection, distributes fees/tip proportionally by food subtotal, then nets `owed - paid` per person. Read both files in full before starting, plus `app/t/[shareCode]/settle/page.tsx`'s `computeConsumed` which duplicates similar logic client-side for the per-person breakdown.

## Goal
Replace the existing "I paid ₹X" input with a toggle:
- **Default mode (unchanged)**: enter amount paid, same as today.
- **Discount mode (new)**: user indicates they paid a *discounted* total via a third-party (Dineout/District-style deal) and enters the actual amount they paid for the whole bill. The app computes the effective discount ratio (`actualPaid / originalBillTotal`) and proportionally reduces *everyone's* share by that same ratio — i.e., the discount benefits the whole table, not just the person who paid.

This is a toggle **instead of** today's plain "I paid" case — not an additional field alongside it. Only one host/payer per table typically triggers this (whoever actually paid the restaurant), so this is likely a per-table setting rather than per-participant — confirm against how `payments` table is structured (per participant today) and decide the simplest correct model: recommend storing the discount ratio (or original total + actual paid) at the table level (new column(s) on `splitTables`, e.g. `actualPaidTotal` nullable numeric) rather than per-participant, since the discount applies to the whole bill's total, not an individual's payment. If a schema change is needed, generate a proper drizzle migration — do not hand-write SQL.

## Implementation
1. Schema (if needed): add a nullable column to `splitTables` (e.g. `actualPaidTotal`) representing the actual amount paid when discount mode is used. Generate the migration with `npx drizzle-kit generate`.
2. API: extend `app/api/payments/route.ts` (or add a small new endpoint if that fits the existing route's shape better — prefer extending) to accept setting/clearing the table's `actualPaidTotal`. Host-or-participant gating: apply the same permission model already used for payments (host can edit; participant edits acceptable if consistent with existing rules — check current gating before deciding).
3. Ledger: modify `computeLedger` in `lib/ledger/compute.ts` to accept an optional discount ratio derived from `actualPaidTotal / originalTotal` and apply it uniformly to every participant's owed amount before netting against payments. Keep the non-discount path byte-identical to today when `actualPaidTotal` is null/unset — this must be a strictly additive code path, not a rewrite.
4. UI: in `app/t/[shareCode]/page.tsx`, replace the plain `PaymentInput` for the "I paid" case with a toggle — "I paid the full amount" (today's behavior) vs "I paid a discounted amount (Dineout/District)" which reveals a single input for the actual total paid. Reflect the resulting per-person reduced amounts wherever totals are shown (settle page `computeConsumed` must also apply the same ratio — keep both calculations consistent, consider extracting the shared ratio-application logic so client and server don't drift).

## Constraints
- Must be additive/backward compatible: existing bills with no discount behave exactly as before.
- Don't touch UPI/tip logic beyond what's needed to keep fee/tip proportional distribution consistent with the new discounted total.
- Scope: `lib/db/schema.ts` + migration, `app/api/payments/route.ts` (or new small route), `lib/ledger/compute.ts`, `app/t/[shareCode]/page.tsx`, `app/t/[shareCode]/settle/page.tsx`.

## Tests required
- `computeLedger` unit tests: no discount (existing behavior unchanged), with discount (e.g. 10% off → every participant's owed amount reduced by 10%, sums still reconcile to `actualPaidTotal`).
- API test: setting a discount, clearing it, invalid values (e.g. actualPaid > originalTotal should probably be rejected — decide and enforce a sane bound).

## Verification before finishing
- `npx tsc --noEmit` passes with no new errors.
- Manually trace a concrete example: bill total ₹1000, actual paid ₹900 (10% discount) → every participant's share reduced by 10%, totals still add up to ₹900.
- Confirm the non-discount path is provably unchanged (diff the ledger output for a bill with no `actualPaidTotal` before/after your change — should be identical).

## When done
- Commit ending in a blank line + `Co-Authored-By: Mimo <noreply@mimo>`.
- Push: `git push -u origin feat/discount-paid-toggle`. Do not open a PR.
