# PRD: Post-Scan Share Sheet with QR Code

**Priority:** P0
**Status:** Planned
**Last updated:** 2026-04-25

---

## Problem

After the receipt is scanned and items are ready, the host sees the item list immediately. But the whole point of the app is *group* splitting — the host needs to get everyone else into the room before they start tapping items. Currently the share button is a small icon in the top-right corner that's easy to miss. Most hosts will tap "Settle up" before their friends have even joined.

---

## Goals

- Make sharing the room link the first thing the host does after a scan succeeds
- Generate a QR code so people in the same physical space can join instantly (scan → tap → done)
- The transition from "scan success" to "share room" should feel polished, not like a loading state
- Host can skip this step if everyone is already in the room

---

## User Flow

```
Receipt upload → OCR processing → items inserted → status = items_ready
                                                          │
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │  ✓ Bill scanned!            │  ← 1s success toast
                                           │  X items found              │     then auto-dissolve
                                           └─────────────────────────────┘
                                                          │  dissolve (0.6s)
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │  Invite everyone            │
                                           │                             │
                                           │  [QR CODE — 200×200]        │
                                           │                             │
                                           │  Room code: G-UUaswm        │
                                           │  [Copy link]  [Share ↗]     │
                                           │                             │
                                           │  Waiting for others…        │
                                           │  ● Dhruv (you)  ○ ○ ○      │  ← live participant dots
                                           │                             │
                                           │  [Continue to bill →]       │  ← host can skip
                                           └─────────────────────────────┘
                                                          │  host taps "Continue"
                                                          ▼
                                                    Item selection screen
```

---

## Component Design

### `ReceiptUpload` → `onProcessed` callback
Currently calls `refresh()` which causes the main page to re-render into item list view. We intercept this: instead of going straight to items, set a new local state `phase: "share"`.

### New component: `ShareRoomSheet`
Full-screen overlay (or new view within the same page) shown after scan completes.

**Props:**
```ts
interface ShareRoomSheetProps {
  shareCode: string;
  participants: Participant[];
  onContinue: () => void;
}
```

**Contents:**
- QR code for `${window.location.origin}/t/${shareCode}` — use `qrcode.react` library
- Room code displayed prominently
- Copy link button (copies URL to clipboard)
- Share button (existing `navigator.share` logic)
- Live participant count/avatars (polling already in place via `useTableData`)
- "Continue to bill →" button to dismiss

### Animation
- Success state: 1-second hold with a checkmark pulse animation
- Dissolve: `AnimatePresence` + `motion.div` with `opacity: 0 → 1`, `y: 20 → 0`, duration 0.6s
- The success state fades out as the share sheet fades in

---

## QR Code

Use `qrcode.react` (React wrapper around qrcode.js):
- Renders as SVG for crisp display on all screen densities
- Dark background: foreground `#fbbf24` (brand amber), background `#0F0F0F`
- Size: 200×200 on mobile

```bash
npm install qrcode.react
```

---

## State Machine

The main `TablePage` gets a new `phase` state:

```ts
type Phase = "idle" | "share" | "items";
```

- `idle`: before any receipt is uploaded
- `share`: after OCR completes, show share sheet
- `items`: after host dismisses share sheet OR table already has items on load

When `table.status` changes to `items_ready` for the first time (i.e. it was `active` before), set `phase = "share"`. If the page loads with `status = items_ready` already (e.g. host refreshes), go straight to `phase = "items"`.

---

## Acceptance Criteria

- [ ] After OCR completes, a 1s success state appears before the share sheet
- [ ] Share sheet shows a scannable QR code linking to the room URL
- [ ] QR code is amber-on-black, visually on-brand
- [ ] Room code is displayed as text below the QR
- [ ] Copy and Share buttons both work
- [ ] Live participant dots update in real time (polling)
- [ ] "Continue to bill →" dismisses the sheet and shows items
- [ ] If page is reloaded after scan, skip straight to items (no share sheet)
- [ ] Animation: success state dissolves into share sheet over 0.6s

---

## Dependencies

- `qrcode.react` (new package)
- No backend changes required
