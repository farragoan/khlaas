# PRD: Clerk Auth with Optional Guest Flow

**Priority:** P0
**Status:** Planned
**Last updated:** 2026-04-25

---

## Problem

The app currently has no accounts. Everyone is anonymous. This prevents:
- Bill history ("what do I owe Arjun across all bills?")
- Trust signals (who created this room?)
- Cross-device continuity (if you clear localStorage you lose your session)

We want accounts to be optional — forcing sign-in before joining a friend's bill creates friction that kills group adoption. The right model: **accounts are opt-in; the app works fully without one**.

---

## Goals

- Authenticated users get a persistent identity across bills
- Anonymous users can still join and participate with zero friction
- Auth is non-blocking: no paywall, no forced gate on guest flow
- Sets up `participants.user_id` correctly for future bill history and group features

---

## Non-Goals

- Restricting any existing functionality behind auth in V1
- Social features, friend lists, or push notifications (those are V2+)
- Guest→account upgrade flow within a session (nice to have, not P0)

---

## User Stories

### Story 1: Bill creator (host)
> As someone who regularly organises bills, I want to sign in so my bills are saved under my account and I can see my history later.

- Host visits `/` and sees "Sign in" + "Continue as guest" options
- Sign-in opens Clerk modal/hosted page
- After auth, host creates a table — `participants[0].user_id = clerkUserId`
- If host continues as guest, existing anonymous flow is unchanged

### Story 2: Guest joining via link
> As someone receiving a share link, I want to join immediately without creating an account.

- Guest opens `/t/[shareCode]`
- Sees name prompt (existing `ParticipantJoin` modal) with an optional "Sign in instead" link below
- If they dismiss the sign-in prompt and enter a name, they join as anonymous (`user_id = null`)
- If they tap "Sign in instead", Clerk modal opens; on success their display name is pre-filled from their Clerk profile

### Story 3: Authenticated guest
> As a Clerk user who opened a share link, I want my name pre-filled and my participation recorded against my account.

- If the user is already signed in when they open `/t/[shareCode]`, the name modal pre-fills from their Clerk profile
- On join, `participants.user_id = clerkUserId`

---

## Auth Model

```
/ (home)             → optional Clerk sign-in shown; guest "skip" creates table anonymously
/t/[shareCode]       → always open; Clerk sign-in offered but not required
/api/tables POST     → no auth required (anonymous table creation still allowed)
/api/participants    → no auth required; if X-Clerk-User header present, set user_id
```

Middleware: **no hard-blocked routes in V1**. Clerk is used for identity enrichment, not access control.

---

## Schema Impact

`participants.user_id` is already nullable UUID in the schema — no migration needed. In V2 this becomes a FK to `users.id`; for now it stores the Clerk `userId` string (we may need to change the type to `text` for Clerk IDs which are strings like `user_2abc...`).

**Schema change needed:** `participants.user_id` type: `uuid` → `text` (Clerk user IDs are not UUIDs).

---

## Implementation Notes

- Install `@clerk/nextjs`
- Wrap `RootLayout` with `<ClerkProvider>`
- Middleware: `clerkMiddleware` in passive mode (no protection, just session reading)
- `POST /api/participants`: read `auth().userId` from Clerk server helpers; if present, set `user_id`
- `ParticipantJoin` modal: add "Sign in with Clerk" secondary button below the name form
- Home page `/`: add a small "Sign in" link in the header; guest flow unchanged

---

## Env Variables Required

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```
