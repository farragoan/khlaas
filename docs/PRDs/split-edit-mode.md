# PRD: Split Edit Mode

**Priority:** P0
**Status:** Shipped ✓
**Shipped:** 2026-04-26 (`ec3ec23`)
**Last updated:** 2026-04-26

---

## Problem

Bills are messy. After settling, people realise they forgot to claim a dish, or notice that someone else's selection is wrong. Currently `status = settled` is a one-way door — there's no way to go back. This makes the app unusable when the first pass isn't perfect, which is almost always.

Additionally, during the selection phase, you can only tap items for yourself. You can't say "this pizza was shared by Arjun and me" if Arjun hasn't joined yet, or if Arjun forgot to tap it.

---

## Goals

- The host (room creator) can re-open a settled bill for editing at any time
- During edit mode, any participant can modify their own selections
- The host can also edit *any* participant's selections (admin override)
- New participants can join during edit mode
- When the host is satisfied, they close edit mode and the ledger re-computes
- The overall flow feels collaborative, not bureaucratic

---

## Non-Goals

- Participants editing *each other's* selections without host approval (too chaotic for V1)
- Conflict resolution UI (two people both claiming the same item) — host resolves this
- Edit history / audit log (V2)

---

## Table Status Extension

Add a new status value `editing` to `split_tables.status`:

```sql
CHECK (status IN ('active', 'items_ready', 'editing', 'settled', 'expired'))
```

### State transitions

```
active → items_ready → settled
                  ↑         │
                  └─────────┘  host taps "Re-open for editing"
                  
items_ready → editing          host opens edit mode during selection phase
editing     → items_ready      host taps "Done editing" (clears ledger, goes back to selection)
editing     → settled          host taps "Settle up" from within edit mode
```

When entering `editing`:
- Delete all existing `ledger_entries` for this table
- Delete all existing `payments` for this table
- Keep all `items` and `selections` intact (users don't lose their work)

When leaving `editing` (host taps "Done editing"):
- Status → `items_ready` (selection view, host can settle when ready)

---

## User Flow

### Triggering edit mode from settle page

```
Settle page (status=settled)
    │
    │  host taps "Re-open bill"  (small button, visible only to host)
    ▼
Confirmation modal: "This will clear the current settlement. Everyone can update their selections."
    │  host confirms
    ▼
POST /api/tables/:id/reopen
    → DELETE ledger_entries WHERE table_id = :id
    → DELETE payments WHERE table_id = :id
    → UPDATE split_tables SET status = 'editing'
    │
    ▼
All participants' screens transition to "Edit mode" banner + item list
    │
    │  everyone edits their selections
    │  host can also edit any participant's selections
    │  new participants can join
    │
    │  host taps "Done editing"
    ▼
POST /api/tables/:id/close-edit
    → UPDATE split_tables SET status = 'items_ready'
    │
    ▼
Host sees "Settle up →" button → pre-settle sheet → settled
```

### Editing another participant's selections (host only)

On the item list in edit mode, the host sees a "Edit as…" participant switcher — a pill strip at the top showing all participants. Tapping a name switches the editing context to that participant. Selections made in that context are attributed to the switched-to participant, not the host.

This reuses the existing `POST /api/selections` and `DELETE /api/selections` endpoints with the `participantId` from the switched-to participant. The host's `sessionToken` is used for auth, but the `participantId` in the request body is the target participant.

**Security note:** The API must verify that the requesting session belongs to `participants[0]` (the host) before allowing cross-participant edits.

---

## UI Changes

### Settle page
- New "Re-open bill" button — small, secondary, visible only to session owner if they are the host
- Protected behind a confirmation modal to prevent accidental taps

### Item list (edit mode)
- Amber "Edit mode" banner at the top: "You're in edit mode — tap to update selections"
- Host sees a participant switcher above the item list
- Non-host participants see their own selections and can edit them (same as normal selection flow)
- Non-host participants see a message: "Waiting for [host] to close editing"

### Status badge (participant strip)
- During edit mode, participant pills show a pencil icon

---

## API Changes

### New: `POST /api/tables/[shareCode]/reopen`
- Auth: session must belong to `participants[0]` (host)
- Deletes `ledger_entries` and `payments` for the table
- Sets `status = 'editing'`

### New: `POST /api/tables/[shareCode]/close-edit`
- Auth: host only
- Sets `status = 'items_ready'`

### Modified: `POST /api/selections`
- In `editing` status: allow any participant to write (same as `items_ready`)
- Host can specify a different `participantId` than their own session's participant — verified server-side that requester is the host

### Modified: `GET /api/tables/[shareCode]`
- `editing` status now treated same as `items_ready` for data fetching

---

## Schema Changes

```sql
ALTER TABLE split_tables DROP CONSTRAINT status_check;
ALTER TABLE split_tables ADD CONSTRAINT status_check
  CHECK (status IN ('active', 'items_ready', 'editing', 'settled', 'expired'));
```

Drizzle schema: update the `.$type<>()` union to include `'editing'`.

---

## Acceptance Criteria

- [ ] Host sees "Re-open bill" on settle page; non-hosts do not
- [ ] Confirmation modal shown before reopening
- [ ] Reopening clears ledger + payments, sets status to `editing`
- [ ] All participants transition to edit view automatically (via polling / ElectricSQL)
- [ ] All participants can edit their own selections in edit mode
- [ ] Host can switch editing context to any participant
- [ ] Cross-participant edits are API-authenticated (host session only)
- [ ] Non-hosts see "Waiting for host to close editing" CTA
- [ ] Host sees "Done editing" button; tapping sets status to `items_ready`
- [ ] New participants can join during edit mode
- [ ] Host can settle directly from edit mode
- [ ] Re-opened bill goes through the pre-settle sheet again (payments + tip re-entered)
