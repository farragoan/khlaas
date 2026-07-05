# Feature: Finish bill history

## Context
This worktree already has `app/api/history/route.ts` (paginated, cursor-based, `GET`, 4-way parallel enrichment via `Promise.all`) and a schema change adding `index("idx_split_tables_created_by")` on `splitTables.createdBy` in `lib/db/schema.ts`. Main has since merged in unrelated work (host identity, rate limiting, UX fixes) — already merged into this branch, no conflicts remain. What's missing: the migration file for the new index, and the entire frontend page. Read the existing `app/api/history/route.ts` in full before starting — know its response shape (`HistoryBillEntry[]`, cursor) precisely.

## Goals
1. Generate the drizzle migration for the already-written index change.
2. Build a `/history` page listing all bills the signed-in user participated in (created or joined), using the existing API.
3. Do NOT build cross-bill balance ("you owe Arjun ₹X across 3 bills") — out of scope for this pass, leave as a roadmap item.

## Implementation

### 1. Generate migration
Run `npx drizzle-kit generate` — this should produce a new migration file (next number after `0006_add_splits_submitted_at.sql`) containing only the `CREATE INDEX` statement for `idx_split_tables_created_by`. Verify the generated SQL only touches the index, nothing else. Do not hand-write the migration.

### 2. `/history` page (`app/history/page.tsx`, new)
- Client component. Require sign-in (this is a Clerk-only feature — guests without an account have no persistent history). If not signed in, show a simple "Sign in to see your bill history" CTA reusing the existing `SignInButton`/`openSignIn()` pattern already used in `app/page.tsx`.
- Fetch `GET /api/history` (with cursor pagination — "load more" button, not infinite scroll, keep it simple).
- List each bill: name/merchant if available, date, total, your share, status (open/settled), and a link to `/t/[shareCode]`.
- Empty state: "No bills yet" with a CTA back to the scan flow.
- Reuse existing UI primitives/styling conventions from `app/t/[shareCode]/page.tsx` and `components/ui/*` — match the app's existing look, don't invent a new visual style.

### 3. Nav entry point
Add a link/button to `/history` from the home page (`app/page.tsx`) — e.g. near the existing sign-in/user button area, visible only when signed in.

## Constraints
- Do not modify `app/api/history/route.ts`'s response shape — build the frontend to match what already exists. If you find a genuine bug in that route while integrating, fix it minimally and note it in the PR description, don't redesign it.
- Do not touch unrelated routes/files (payments, ledger, receipts, middleware).
- No cross-bill balance calculation in this pass.

## Tests required
- Add tests for the `/api/history` route if none exist (pagination cursor correctness, filtering by createdBy OR participant, empty state).
- Add a basic render test for the `/history` page (signed-out CTA, empty state, list rendering with mock data) using whatever test setup already exists in the repo (check `package.json` for a test runner — vitest/jest — before assuming one).

## Verification before finishing
- `npx tsc --noEmit` passes with no new errors.
- `npx drizzle-kit generate` was actually run and produced a migration file — check `drizzle/` for the new file, don't just claim it.
- Manually trace: signed-out user visiting `/history` → sees sign-in CTA, not a crash or empty fetch.
- Run the test suite, all new and existing tests pass.

## When done
- Commit with a descriptive message ending in a blank line + `Co-Authored-By: Mimo <noreply@mimo>`.
- Push the branch: `git push -u origin worktree-feat+bill-history`.
- Do not open a pull request — just push the branch.
