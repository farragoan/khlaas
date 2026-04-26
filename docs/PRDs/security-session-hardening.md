# PRD: Session Token Hardening

**Priority:** P1
**Status:** Planned
**Last updated:** 2026-04-26

---

## Problem

Session tokens (`nanoid(32)` = 192 bits of entropy) are stored as plaintext in `participants.session_token`. If the Neon database is compromised (e.g., leaked connection string, SQL injection via a future bug), all session tokens are exposed, allowing an attacker to impersonate any participant on any table.

Additionally, there is no server-side session expiry — tokens are valid indefinitely once issued (tables expire after 24h via `expires_at`, but there is no token invalidation mechanism).

---

## Goals

- Session tokens at rest are not usable directly, even if the DB is read
- No user-facing flow changes
- Minimal latency impact

---

## Non-Goals

- Formal "session" table with refresh tokens (Clerk will handle this post-auth)
- Token revocation UI (V2)

---

## Approach

### Hash tokens before storing

Store `SHA-256(sessionToken)` in the DB instead of the raw token. The raw token stays only in the client's localStorage.

On every auth check:
1. Client sends raw `nanoid(32)` token in `x-session-token`
2. Server computes `SHA-256(token)` and compares against stored hash

```ts
import { createHash } from "crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

### Migration

1. Add `session_token_hash text` column to `participants`
2. Backfill: `UPDATE participants SET session_token_hash = encode(sha256(session_token::bytea), 'hex')`
3. Switch auth checks to compare `session_token_hash`
4. Drop `session_token` column
5. Update `lib/auth.ts` and `app/api/participants/route.ts`

### Schema change

```sql
ALTER TABLE participants ADD COLUMN session_token_hash text;
UPDATE participants SET session_token_hash = encode(sha256(session_token::bytea), 'hex');
ALTER TABLE participants DROP COLUMN session_token;
ALTER TABLE participants ADD CONSTRAINT session_token_hash_not_null CHECK (session_token_hash IS NOT NULL);
```

---

## Acceptance Criteria

- [ ] `participants.session_token` replaced with `session_token_hash`
- [ ] `hashToken()` utility in `lib/auth.ts`
- [ ] All auth checks (`verifyHostSession`, `validateSession` in selections, reopen, close-edit) use hash comparison
- [ ] `POST /api/participants` stores hash, not raw token
- [ ] Existing sessions invalidated (one-time migration; users re-join)
- [ ] `GET /api/tables/[shareCode]` confirmed to not return `session_token_hash`

---

## Dependencies

- Drizzle migration
- `npx drizzle-kit push` user action
