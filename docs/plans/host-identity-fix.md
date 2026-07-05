# Fix: host identity resolution survives session loss

## Context
khlaas is a Next.js bill-splitting app (Drizzle ORM, Postgres/Neon, Clerk auth for signed-in users, hashed guest session tokens for anonymous participants stored in `localStorage`).

"Host" privilege is currently resolved **positionally**: whoever is participant #1 by `joinedAt`, matched via a `x-session-token` header against a hashed token stored on that participant row. This is checked identically in:
- `lib/auth.ts` — `verifyHostSession(tableId, sessionToken)`
- `app/api/tables/[shareCode]/route.ts` (GET — no host check needed there for reads, PATCH — host-gated)
- `app/api/tables/[shareCode]/close-edit/route.ts`
- `app/api/tables/[shareCode]/reopen/route.ts`
- `app/api/ledger/compute/route.ts`
- `app/api/payments/route.ts`

Frontend independently re-derives host status positionally and locally (no server trust):
- `app/t/[shareCode]/page.tsx:409` — `const isHost = !!session && participants[0]?.id === session.participantId;`
- `app/t/[shareCode]/settle/page.tsx:345` — same pattern

**The bug:** `POST /api/tables` (table creation) never inserts the creator as a participant — it only sets `splitTables.createdBy` (Clerk userId). Host status is purely tied to a `localStorage` blob (`hooks/use-session.ts`, keyed `khlaas:session:{tableId}`). If a signed-in Clerk user closes the tab, switches browser/device, or clears storage, they permanently lose host status on that table even though they're still authenticated as the same Clerk user who owns it. Rejoining just appends them to the end of the participant list.

## Fix design — no schema migration needed
`participants.userId` (Clerk userId, nullable) and `splitTables.createdBy` (Clerk userId) already exist and are already populated on participant/table creation. Use them as the durable source of truth, with the current positional check kept only as a fallback for guest-created tables (no Clerk account involved).

### 1. `lib/auth.ts`
Replace `verifyHostSession` with:

```ts
export async function verifyHost(
  tableId: string,
  opts: { sessionToken?: string | null; clerkUserId?: string | null }
): Promise<{ id: string } | null> {
  if (opts.clerkUserId) {
    const [table] = await db
      .select({ createdBy: splitTables.createdBy })
      .from(splitTables)
      .where(eq(splitTables.id, tableId))
      .limit(1);
    if (table?.createdBy === opts.clerkUserId) {
      const [hostParticipant] = await db
        .select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.tableId, tableId), eq(participants.userId, opts.clerkUserId)))
        .limit(1);
      if (hostParticipant) return hostParticipant;
      // Clerk user owns the table but hasn't joined as a participant yet — not host until they join.
      return null;
    }
  }
  if (!opts.sessionToken) return null;
  const [host] = await db
    .select({ id: participants.id, sessionToken: participants.sessionToken })
    .from(participants)
    .where(eq(participants.tableId, tableId))
    .orderBy(asc(participants.joinedAt))
    .limit(1);
  if (!host || host.sessionToken !== hashToken(opts.sessionToken)) return null;
  return { id: host.id };
}
```

Import `splitTables` and `and` as needed. Delete the old `verifyHostSession` entirely — update every call site (no backwards-compat shim, per project convention).

### 2. Update every host-gated route
In each of `close-edit`, `reopen`, `ledger/compute`, `payments` (POST), and the `PATCH` handler in `tables/[shareCode]/route.ts`:
- Call `const { userId } = await auth();` (Clerk, `@clerk/nextjs/server`) alongside the existing `x-session-token` header read.
- Call `verifyHost(tableId, { sessionToken, clerkUserId: userId })` instead of `verifyHostSession(tableId, sessionToken)`.
- Keep the existing 401/403 responses when it returns null — behavior for guest-hosted tables must be unchanged.

### 3. `GET /api/tables/[shareCode]/route.ts`
- Read the optional `x-session-token` header (GET currently doesn't).
- Call `auth()` for `userId`.
- Compute `const hostParticipant = await verifyHost(table.id, { sessionToken, clerkUserId: userId });`
- Add `isHost: !!hostParticipant` to the JSON response body.

### 4. Frontend
- `app/t/[shareCode]/page.tsx`: replace the positional `isHost` computation with the `isHost` field from the table API response (trace how `table`/data flows in via the data-fetching hook, likely `useTableData` — thread `isHost` through the same way `table`/`items`/`participants` already flow).
- `app/t/[shareCode]/settle/page.tsx`: same replacement.
- Do not add any "auto-join as participant" behavior — a Clerk user who owns a table but hasn't joined it is not host yet; that's a deliberate, separate UX decision, not part of this fix.

## Constraints
- No database migration. No new columns.
- No changes to ledger/payment math.
- No live database queries against production data — implement and reason from the schema/code alone.
- Don't touch the `feat/bill-history` worktree or branch; unrelated in-progress work.
- Keep diffs minimal and scoped to the files above.

## Verification before finishing
- `npx tsc --noEmit` must pass with no new errors.
- `npm run lint` must pass with no new errors.
- Read back every modified file once complete to confirm the guest (non-Clerk) host path still behaves exactly as before.

## When done
- `git add` the changed files (do not add unrelated files) and commit with a descriptive message ending in a blank line + `Co-Authored-By: Mimo <noreply@mimo>`.
- Push the branch: `git push -u origin fix/host-identity-resolution`.
- Do not open a pull request — just push the branch.
