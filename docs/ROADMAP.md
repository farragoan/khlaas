# khlaas — Product Roadmap

_Last updated: 2026-04-25_

---

## P0 — Must ship

### Clerk Auth with Optional Guest Flow
**PRD:** `docs/PRDs/clerk-auth-guest-flow.md`

Sign in with Clerk OR continue as a named guest — no forced gate. Authenticated users get `participants.user_id` populated for future bill history. Anonymous flow stays fully intact.
- [ ] Install `@clerk/nextjs`, wrap layout with `ClerkProvider`
- [ ] Middleware in passive mode (no route blocking in V1)
- [ ] Home page: optional "Sign in" link alongside guest flow
- [ ] `ParticipantJoin` modal: secondary "Sign in instead" option
- [ ] `POST /api/participants`: set `user_id` from Clerk session if present
- [ ] `participants.user_id` type: `uuid` → `text` (Clerk IDs are strings)
- [ ] Env vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`

### Post-Scan Share Sheet with QR Code
**PRD:** `docs/PRDs/post-scan-share-sheet-qr.md`

After the receipt is scanned, show a 1s success CTA that dissolves into a full share sheet with a scannable QR code, room code, and live participant dots. Host taps "Continue to bill" when everyone is in.
- [ ] Install `qrcode.react`
- [ ] Add `phase: "idle" | "share" | "items"` state to `TablePage`
- [ ] Transition to `share` phase when status changes `active → items_ready` for the first time
- [ ] Skip to `items` if page loads with `items_ready` already set (refresh case)
- [ ] New `ShareRoomSheet` component: QR code, room code, copy/share buttons, live participant dots, "Continue →" button
- [ ] Success state: 1s hold + checkmark animation, dissolves into share sheet

### Split Edit Mode
**PRD:** `docs/PRDs/split-edit-mode.md`

Host can re-open a settled bill from the settle page. Everyone can edit selections; host can edit any participant's selections. New participants can join. Host closes edit mode and re-settles.
- [ ] Add `editing` to `status` enum in schema + DB
- [ ] `POST /api/tables/[shareCode]/reopen` — host only; clears ledger + payments, sets `editing`
- [ ] `POST /api/tables/[shareCode]/close-edit` — host only; sets `items_ready`
- [ ] `POST /api/selections`: allow cross-participant edits when requester is host
- [ ] Settle page: "Re-open bill" button (host only) + confirmation modal
- [ ] Item list: "Edit mode" banner, host participant switcher
- [ ] Non-host: "Waiting for host to close editing" message
- [ ] All screens transition automatically when status changes (polling / ElectricSQL)

---

## In Progress

### Payments, Tip & Settlement Detail ✓ shipped
**Spec:** `docs/superpowers/specs/2026-04-22-payments-tip-settlement-design.md`

- [x] `payments` table + `tip` column on `split_tables` (schema + drizzle)
- [x] `POST /api/payments` upsert endpoint
- [x] `computeLedger` updated to use `net = owes - paid` + tip distribution
- [x] Pre-settle sheet UI (who paid, how much, tip input)
- [x] Settle page: "Paid by" section
- [x] Settle page: per-person detail slide-in panel
- [x] `GET /api/tables/[shareCode]` returns payments

---

## Planned

### Google AI OCR Reliability (Bug)
The receipt OCR route calls Google AI Studio without retry logic. Three issues to fix:
- [ ] Exponential backoff with 3 retries on Google AI API calls (`extractViaGoogleAI` in `app/api/receipts/route.ts`)
- [ ] Ensure the upload button resets to idle state on failure so the user can press it again and re-trigger the API call
- [ ] Debounce the upload/process button so rapid taps don't fire multiple concurrent requests

### Netlify Deployment ✓ shipped
- [x] Add `netlify.toml` with Next.js plugin
- [x] Configure `@netlify/plugin-nextjs`
- [x] Document required env vars for Netlify dashboard
- [x] Verify build passes (`next build`)

### Real-Time Sync (ElectricSQL → replace polling)
Currently using 2s interval polling in `useTableData`. Replace with ElectricSQL shape
subscriptions for instant updates across all participants.
- [ ] Wire up ElectricSQL sync engine to Neon (logical replication)
- [ ] Replace `useTableData` polling with shape subscriptions
- [ ] Shapes: `split_tables`, `items`, `participants`, `selections`, `payments`
- [ ] Set `REPLICA IDENTITY FULL` on all synced tables

### Receipt Image Storage (Cloudflare R2)
Currently base64 is sent in the request body — fine for MVP but won't scale.
- [ ] Presigned PUT URL endpoint (`POST /api/receipts/upload-url`)
- [ ] Client uploads directly to R2
- [ ] Store R2 object key in `split_tables.receipt_url`
- [ ] OCR pipeline reads from R2 instead of body

### Async OCR Pipeline (Netlify Background Functions)
Currently OCR runs synchronously in the route handler — will time out on large receipts.
- [ ] Move OCR to `/.netlify/functions/ocr-process-background`
- [ ] `POST /api/receipts/process` returns `202 { jobId }` immediately
- [ ] Background function: Google Document AI → Gemma fallback → DeepSeek fallback
- [ ] Status polling / ElectricSQL push when done

### Manual Item Editing
OCR isn't perfect. Host should be able to add, edit, and delete items before settling.
- [ ] Edit item name and price inline
- [ ] Add item manually
- [ ] Delete item
- [ ] Re-order items (drag)

### Item Split Modes
Currently all shared items split equally among selectors.
- [ ] Unequal split (enter custom amounts per person)
- [ ] "For the table" items (auto-split equally among all participants)

### Currency & Locale Support
Currently hardcoded to ₹.
- [ ] Detect locale on table creation
- [ ] Store currency code on `split_tables`
- [ ] `<Price>` component renders correct symbol and formatting

### Settle Screen: Share Summary
The share button currently shares a plain text list. Improve it.
- [ ] Rich share card (OG image) showing totals
- [ ] Deep link per person: "Dhruv, you owe ₹304 — tap to see details"
- [ ] WhatsApp / UPI intent support

### Expiry & Cleanup
`split_tables.expires_at` is set but never enforced.
- [ ] Cron job (Netlify scheduled function) to mark tables expired after 24h
- [ ] Expired tables show a tombstone page

---

## V2 (Post-Auth)

### Lucia Auth
- [ ] `users` + `user_sessions` tables (already in schema.sql)
- [ ] Sign-up / sign-in flow (email + OTP or OAuth)
- [ ] Link anonymous V1 sessions to user account
- [ ] `participants.user_id` populated for logged-in users
- [ ] Restrict writes to authenticated owners

### Bill History
Once auth exists:
- [ ] `/history` page listing all tables the user participated in
- [ ] Cross-bill balance with a friend ("you owe Arjun ₹X across 3 bills")

### Groups
- [ ] Create a named group (flat, roommates, team)
- [ ] One-tap "start a bill for this group" pre-populates participants
- [ ] Running group balance

---

## Won't Do (explicitly out of scope for V1)

- Native mobile app (PWA covers the use case)
- In-app payments / UPI integration (out of regulatory scope for V1)
- Multi-currency bills (one currency per table only)
