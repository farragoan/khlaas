# Feature: skeleton loading states on billing and final-splits screens

## Context
`components/ui/skeleton.tsx` already exists (shadcn-style `animate-pulse` block) and is already used in `components/processing-state.tsx` during receipt OCR wait — that one is fine as-is, don't touch it. Two screens currently lack proper skeletons:
- `app/t/[shareCode]/settle/page.tsx` (lines ~335-341) shows a plain `<div className="animate-pulse text-zinc-600">Loading…</div>` text instead of a skeleton matching the eventual layout.
- Main table/billing page `app/t/[shareCode]/page.tsx` has no top-level loading skeleton — uses only button-level `Loader2` spinners; initial load before `useTableData` returns data likely renders nothing or a blank flash.

## Goal
Add skeleton loading UI (using the existing `components/ui/skeleton.tsx` primitive) on:
1. The billing/table screen (`app/t/[shareCode]/page.tsx`) — while initial data is loading (before first successful `useTableData` fetch), show placeholder skeletons approximating the eventual layout (item rows, participant strip, totals) instead of blank/nothing.
2. The final splits/settle screen (`app/t/[shareCode]/settle/page.tsx`) — replace the plain "Loading…" text with skeleton blocks approximating the per-person breakdown layout.

## Implementation
- Build skeleton layouts that loosely mirror each screen's real structure (a few placeholder rows/blocks of appropriate size), not pixel-perfect — the goal is reducing perceived jank, not exact matching.
- Reuse `components/ui/skeleton.tsx` directly; do not create a second skeleton primitive.
- Gate on the existing loading signals already present in each page (e.g. `useTableData`'s loading flag if one exists — check the hook; if it doesn't expose one, add a minimal `isLoading` boolean to `useTableData`'s return value based on whether the first fetch has resolved, and use it here — but do not otherwise change the hook's polling behavior).

## Constraints
- Do not touch `components/processing-state.tsx` or the OCR upload flow — those already have appropriate skeletons.
- Do not change data-fetching logic beyond exposing a loading boolean if missing.
- Scope: `app/t/[shareCode]/page.tsx`, `app/t/[shareCode]/settle/page.tsx`, `hooks/use-table-data.ts` (loading flag only, if needed), no other files.

## Tests required
- Render test: page renders skeleton when loading flag is true / data not yet available.
- Render test: page renders normal content once data is available (skeleton not shown).

## Verification before finishing
- `npx tsc --noEmit` passes with no new errors.
- Visually reason through both screens' skeleton layouts against their real layouts to confirm they're a reasonable approximation (row counts, general shape).

## When done
- Commit ending in a blank line + `Co-Authored-By: Mimo <noreply@mimo>`.
- Push: `git push -u origin feat/skeleton-loading`. Do not open a PR.
