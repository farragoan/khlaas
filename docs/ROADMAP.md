# khlaas — Product Roadmap

_Last updated: 2026-04-26_

---

## Security

Shipped in this pass: session token leak fixed, auth added to payments/ledger/receipts endpoints, security headers added. Remaining:

### API Rate Limiting _(P1)_
**PRD:** `docs/PRDs/security-rate-limiting.md`

Upstash Redis + `@upstash/ratelimit` middleware. Strict limits on `/api/receipts` (3/min) and `/api/participants` (10/min) to prevent abuse and AI API credit drain.
- [ ] Install `@upstash/ratelimit` + `@upstash/redis`
- [ ] `middleware.ts` with per-route sliding window limits
- [ ] Provision Upstash (free tier) and add env vars to Netlify

### Session Token Hashing _(P1)_
**PRD:** `docs/PRDs/security-session-hardening.md`

Store `SHA-256(token)` in DB instead of raw token. DB leak no longer exposes usable credentials.
- [ ] Add `session_token_hash` column, drop `session_token`
- [ ] Update `lib/auth.ts`, `app/api/participants/route.ts`, all auth checks
- [ ] `npx drizzle-kit push`

### Infrastructure Hardening _(user actions — see `docs/user-actions.md`)_
- [ ] Cloudflare WAF + rate limiting in front of Netlify
- [ ] Neon IP allowlisting to Netlify outbound ranges
- [ ] Quarterly key rotation (Google AI, OpenRouter, Neon)
- [ ] Sentry error monitoring before public launch

---

## P0 — Must ship

_All P0 items shipped. See Shipped section below._

---

## Planned

### Google AI OCR Reliability (Bug)
The receipt OCR route calls Google AI Studio without retry logic. Three issues to fix:
- [ ] Exponential backoff with 3 retries on Google AI API calls (`extractViaGoogleAI` in `app/api/receipts/route.ts`)
- [ ] Upload button resets to idle on failure so the user can re-trigger
- [ ] Debounce the upload/process button to prevent concurrent requests

### Real-Time Sync (ElectricSQL → replace polling)
Currently using 2s interval polling in `useTableData`. Replace with ElectricSQL shape subscriptions for instant updates.
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

### Settle Screen: Share Summary
The share button currently shares a plain text list.
- [ ] Rich share card (OG image) showing totals
- [ ] Deep link per person: "Dhruv, you owe ₹304 — tap to see details"
- [ ] WhatsApp / UPI intent support

### Expiry & Cleanup
`split_tables.expires_at` is set but never enforced.
- [ ] Cron job (Netlify scheduled function) to mark tables expired after 24h
- [ ] Expired tables show a tombstone page

---

## V2 (Post-Auth)

### Bill History
- [ ] `/history` page listing all tables the user participated in
- [ ] Cross-bill balance with a friend ("you owe Arjun ₹X across 3 bills")

### Groups
- [ ] Create a named group (flat, roommates, team)
- [ ] One-tap "start a bill for this group" pre-populates participants
- [ ] Running group balance

---

## Shipped

### Clerk Auth with Optional Guest Flow ✓
_Shipped: 2026-04-26_
**PRD:** `docs/PRDs/clerk-auth-guest-flow.md`

`@clerk/nextjs` installed, passive `clerkMiddleware`, `ClerkProvider` in layout, sign-in button on home, optional "Sign in instead" in `ParticipantJoin`, `participants.user_id` (text) populated from Clerk session.

### Post-Scan Share Sheet with QR Code ✓
_Shipped: 2026-04-26_ · `ec3ec23`
**PRD:** `docs/PRDs/post-scan-share-sheet-qr.md`

1s success toast → full share sheet with QR code, room code, copy/share, live participant dots, "Continue to bill" CTA.

### Split Edit Mode ✓
_Shipped: 2026-04-26_ · `ec3ec23`
**PRD:** `docs/PRDs/split-edit-mode.md`

Host can re-open settled bills. Everyone edits selections; host edits any participant. New participants can join. Host closes edit mode and re-settles.

### Currency & Locale Support ✓
_Shipped: 2026-04-26_ · `ec3ec23` + `a26d022`

Locale auto-detected on table creation, currency stored on `split_tables`, `<Price>` renders correct symbol and formatting, currency selector on home page.

### Payments, Tip & Settlement Detail ✓
_Shipped: 2026-04-22_

`payments` table + `tip` column, `POST /api/payments` upsert, `computeLedger` with net = owes − paid + tip distribution, pre-settle sheet, settle page per-person detail panel.

### Netlify Deployment ✓
_Shipped: 2026-04-22_

`netlify.toml` with `@netlify/plugin-nextjs`, env vars documented, build verified.

---

## Won't Do (explicitly out of scope for V1)

- Native mobile app (PWA covers the use case)
- In-app payments / UPI integration (out of regulatory scope for V1)
- Multi-currency bills (one currency per table only)
- Lucia Auth (replaced by Clerk)
