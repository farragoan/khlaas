# Perf: audit and fix request waterfalls

## Context
Most of the codebase already parallelizes reasonably well: `app/api/tables/[shareCode]/route.ts` GET does 2 staged `Promise.all` batches (unavoidably staged since selections/ledger depend on items/table status), and `app/api/history/route.ts` already does 4-way parallel enrichment. The known offender: `app/t/[shareCode]/page.tsx` does several sequential `await fetch(...)` calls for independent save actions (e.g. around lines 443-485: UPI, tip, displayName updates) that don't depend on each other's results but run one after another.

## Goal
Find and fix genuine request waterfalls — sequential network round-trips that could run concurrently because they don't depend on each other. This is an audit + fix task, not a rewrite: don't touch code that's already correctly parallel (the 2 routes named above are fine as-is; staged `Promise.all` where stage 2 genuinely depends on stage 1's result is correct, not a bug).

## Implementation
1. Audit, starting from the known spot: `app/t/[shareCode]/page.tsx` sequential UPI/tip/displayName update calls — convert independent ones to `Promise.all`. Verify each pair/group is genuinely independent (no shared mutable state, no ordering requirement, no one depending on another's response) before parallelizing.
2. Broadly grep the codebase for other sequential `await fetch`/`await db.select` chains in both API routes (`app/api/**/route.ts`) and client components where each call doesn't use the previous call's output. Common places to check: any settle/close-edit flow that fires multiple updates, any page that loads several independent resources sequentially on mount.
3. For each genuine waterfall found, convert to `Promise.all` (or `Promise.allSettled` if partial failure should be tolerated — decide per-case, default to `Promise.all` unless partial success is meaningfully useful to the user).
4. Do NOT parallelize anything with a real dependency (e.g., needing a table's `id` before querying `items`/`participants` — that must stay sequential).

## Constraints
- Do not change response shapes, error handling semantics, or add retries — purely reorder to run independent async calls concurrently.
- Do not touch `middleware.ts`, `lib/rate-limit.ts`, or auth logic.
- Keep the diff scoped to genuine fixes — do not touch files with no waterfall to fix just for the sake of it.

## Tests required
- Where fixed code has existing tests, ensure they still pass. Where fixing client-side sequential fetches, add or update a test asserting the calls fire concurrently (e.g. via mocked fetch call-order/timing assertions) rather than sequentially, for at least the known UPI/tip/displayName case.

## Verification before finishing
- `npx tsc --noEmit` passes with no new errors.
- Produce a short list in the PR description of every waterfall found and fixed (file + before/after description) — this is required output, not optional, so the reviewer can verify each one is a genuine independent-call fix and not a correctness regression.
- Manually confirm no fixed case introduced a race condition (e.g. two updates that both read-modify-write the same field would be unsafe to parallelize — check for this specifically).

## When done
- Commit ending in a blank line + `Co-Authored-By: Mimo <noreply@mimo>`.
- Push: `git push -u origin perf/fix-waterfalls`. Do not open a PR.
