# Feature: Sign-in option on join flow

## Context
`components/participant-join.tsx` is the component shown to someone opening a share link/QR code who isn't the table creator. It already imports `useUser()` from `@clerk/nextjs` and pre-fills the name field if the user happens to already be signed in, and has a small "Sign in instead to save your bill history" link using `SignInButton mode="modal"` (around lines 106-114). Read the full file before starting.

`POST /api/participants` (`app/api/participants/route.ts`) already calls `await auth()` and stores `userId: userId ?? null` on the participant row — no backend change needed for basic association.

Existing sign-in UI patterns to reuse (don't invent new ones): `app/page.tsx` uses both `SignInButton mode="modal"` and `useClerk().openSignIn()`.

## Goals
Right now signing in is a secondary, easy-to-miss link. Make it a first-class choice at the top of the join step:
1. If the user is **already signed in** when they open the share link: skip the name-entry step entirely — use their Clerk profile name, join automatically (or with a single confirm tap), no free-text name field shown.
2. If **not signed in**: present two equally-weighted options up front — "Sign in with Google" (via Clerk) or "Continue as guest" (existing name-entry flow, unchanged). Do not remove the guest path — it must keep working exactly as today.
3. After choosing "Sign in with Google" and completing Clerk's flow, the user should land back in the join flow already filled in / auto-joined, not dropped somewhere else.

## Implementation
- Modify `components/participant-join.tsx`:
  - Branch UI on `useUser()`'s `isSignedIn`/`isLoaded` state: signed-in → auto-fill name (already partially done) and show a single "Join as {name}" button, no manual name field.
  - Signed-out → two options: a primary "Sign in with Google" button (`openSignIn()` or `SignInButton`, check Clerk config for whether Google is the only/default OAuth provider — do not hardcode assumptions, check `middleware.ts`/Clerk dashboard-driven config if referenced in code, otherwise just use Clerk's default sign-in UI which will show configured providers) and a secondary "Continue as guest" that reveals/keeps the existing name-input form.
  - Ensure Clerk's modal sign-in redirects back to the same share-code URL (`/t/[shareCode]`) after completing — check Clerk's `redirectUrl`/`afterSignInUrl` props if needed so the user doesn't lose their place.
- Do not change `POST /api/participants` behavior — it already handles `userId` correctly.

## Constraints
- Do not touch host-side flows, table creation, or any file outside `components/participant-join.tsx` and (only if strictly required for redirect behavior) `middleware.ts`'s Clerk config — do not modify rate limiting or auth logic there.
- Guest flow must remain fully functional for users who decline to sign in.
- Do not require sign-in — it must stay optional, per the existing product decision (`docs/PRDs/clerk-auth-guest-flow.md` — read it first).

## Tests required
- Add tests covering: signed-in user sees no name field and joins with Clerk name; signed-out user sees both options; guest path still collects a name and joins; signed-out → sign-in → returns to join flow correctly (as much as this can be tested without a live Clerk session — mock `useUser`/`useClerk`).

## Verification before finishing
- `npx tsc --noEmit` passes with no new errors.
- Read back `components/participant-join.tsx` in full once done.
- Manually trace all 3 paths (signed-in, guest, sign-in-then-join) against the code logic.

## When done
- Commit ending in a blank line + `Co-Authored-By: Mimo <noreply@mimo>`.
- Push: `git push -u origin feat/join-signin`. Do not open a PR.
