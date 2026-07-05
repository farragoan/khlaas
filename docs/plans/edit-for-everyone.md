# Feature: Signed-in participants can edit everyone's selections

## Context
Today, editing another participant's item selections is host-only:
- Client: `app/t/[shareCode]/page.tsx` line ~409 `const isHost = !!session && participants[0]?.id === session.participantId;` and line ~697 `const canEdit = isHost || p.id === session?.participantId;` gates the edit UI per participant row.
- Server: `app/api/selections/route.ts` has a host-override check (host = first joined participant) allowing the host to edit anyone; non-hosts can only edit their own selections.
- "Host" is purely positional (first participant by join order) — this is a separate, older concept from `isHost`/`verifyHost` in `lib/auth.ts` (the Clerk-based host-identity fix shipped separately for host-gated *table* actions like close-edit/reopen/payments). Do not confuse the two — this task is specifically about selection editing, which uses the positional host check, not `verifyHost`.

Read `app/api/selections/route.ts`, `lib/auth.ts` (`verifyHost`), and `app/t/[shareCode]/page.tsx` around the lines above in full before starting.

## Goal
Any **signed-in participant of that specific bill** (i.e., has a Clerk `userId` on their `participants` row for this table) can edit any other participant's item selections — not just the positional host. Guests (no `userId`) keep today's behavior: can only edit their own selections, and if they attempt to edit someone else's, show a small popup/toast: "Signed in users can edit bills for everyone."

## Implementation
### Server (`app/api/selections/route.ts`)
- Add a new authorization path alongside the existing host-override: if the requester has a Clerk `userId` (from `auth()`) AND that `userId` matches a `participants` row for this table (i.e., they're a real participant, not a rando with a valid session token for a different table), allow editing any participant's selections in this table — not just the host's.
- Keep the existing positional-host override and guest-self-only behavior unchanged as fallbacks.

### Client (`app/t/[shareCode]/page.tsx`, `components/item-list.tsx`)
- Compute a new flag, e.g. `canEditOthers = isHost || (currentUserIsSignedIn && currentParticipantHasUserId)` — check via Clerk's `useUser()`/`useAuth()` whether the viewer is signed in AND their own participant row has a `userId` set (i.e., they joined signed-in, not as a guest who later logged in elsewhere).
- Update the `canEdit` logic (line ~697) to use `canEditOthers` instead of `isHost` for the "can edit someone else's row" case.
- When a signed-out/guest user taps/clicks on another participant's selection row, instead of silently blocking, show a small popup (reuse whatever toast/dialog primitive the app already uses — check `components/ui/` for an existing `Toast`/`Snackbar`/`Dialog`, the settle page already added a snackbar in a recent fix, reuse that pattern) with the text: "Signed in users can edit bills for everyone."

## Constraints
- Do not change `verifyHost`/`lib/auth.ts` or any of the host-gated table-level actions (close-edit, reopen, ledger/compute, payments, table PATCH) — those are unrelated and already correct.
- Do not remove the existing positional-host override — it must still work for hosts who are guests (not signed in).
- Scope changes to `app/api/selections/route.ts`, `app/t/[shareCode]/page.tsx`, `components/item-list.tsx`, and a new/reused toast component if one doesn't already fit.

## Tests required
- Server: signed-in participant editing another's selection → allowed; guest editing another's → rejected (403); host (positional) editing another's → still allowed regardless of sign-in.
- Client: popup appears for guest attempting to edit someone else's row; signed-in participant sees edit controls enabled for all rows.

## Verification before finishing
- `npx tsc --noEmit` passes with no new errors.
- Manually trace: (a) signed-in participant, not the positional host, edits someone else's item — allowed; (b) guest, not host, attempts same — blocked + popup shown; (c) positional host who is a guest — still works as today.

## When done
- Commit ending in a blank line + `Co-Authored-By: Mimo <noreply@mimo>`.
- Push: `git push -u origin feat/edit-for-everyone`. Do not open a PR.
