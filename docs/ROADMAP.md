# khlaas — Product Roadmap

_Last updated: 2026-07-22_

Package manager: pnpm (switched back from npm on 2026-07-22 — see commit history for why).

---

## Security

Shipped in this pass: session token leak fixed, auth added to payments/ledger/receipts endpoints, security headers added. Remaining:

### Host Identity Is Positional, Not Durable ✓ _(P0 — user-reported real incident)_
_Shipped: 2026-07-04_ · plan: `docs/plans/host-identity-fix.md`

`isHost` was computed as `participants[0]?.id === session.participantId`, backed by a positional server-side check keyed entirely to a `localStorage` session blob with no Clerk fallback. Closing the tab, switching browsers/devices, or clearing storage permanently stripped host status from the actual table creator, even if still signed in via Clerk.

No schema migration needed — `participants.userId` and `splitTables.createdBy` already existed and were populated.
- [x] `lib/auth.ts`: `verifyHost(tableId, { sessionToken?, clerkUserId? })` — Clerk userId matched against `splitTables.createdBy` resolves host via the participant row where `userId === clerkUserId` (session-independent); falls back to the positional sessionToken check for guest-created tables
- [x] Threaded `auth()`'s userId into every host-gated route: `close-edit`, `reopen`, `ledger/compute`, `payments`, `receipts`, `tables/[shareCode]` PATCH
- [x] `GET /api/tables/[shareCode]` computes and returns `isHost` server-side instead of leaving the frontend to infer it
- [x] Frontend: replaced the two positional `isHost` computations with the server-provided flag
- [ ] Open design question, not yet decided: should a signed-in host who created the table but never joined as a participant be auto-joined, or shown a "reclaim host" action? Current behavior: not host until they join.

### API Rate Limiting ✓ _(P1)_
_Shipped: 2026-07-04_ · plan: `docs/plans/rate-limiting.md` · **PRD:** `docs/PRDs/security-rate-limiting.md`

Sliding-window per-IP limits in `middleware.ts`: `/api/receipts` 3/min, `/api/participants` 10/min, `POST /api/tables` 5/min, all other `/api/*` 60/min.
- [x] Install `@upstash/ratelimit` + `@upstash/redis`
- [x] `middleware.ts` with per-route sliding window limits, layered alongside Clerk's existing passive middleware (unchanged)
- [x] `lib/rate-limit.ts` — uses real Upstash Redis when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set, falls back to an in-memory sliding window otherwise (per-instance only, documented limitation)
- [ ] Provision Upstash (free tier) and add env vars to Netlify — **user action**, see `docs/user-actions.md` §4

### Session Token Hashing _(P1 — hashing shipped, cosmetic rename remaining)_
**PRD:** `docs/PRDs/security-session-hardening.md`

SHA-256 hashing is already implemented in `lib/auth.ts` (`createHash("sha256")` before storage/compare). DB leak no longer exposes usable credentials.
- [x] `lib/auth.ts`: `hashToken()` hashes with SHA-256 before storage/compare
- [x] All auth checks use hashed tokens
- [ ] (cosmetic, low-priority) Rename `session_token` column → `session_token_hash` for clarity; requires drizzle migration

### Infrastructure Hardening _(user actions — see `docs/user-actions.md`)_
- [ ] Cloudflare WAF + rate limiting in front of Netlify
- [ ] Neon IP allowlisting to Netlify outbound ranges
- [ ] Quarterly key rotation (Google AI, OpenRouter, Neon)
- [ ] Sentry error monitoring before public launch

### Other Audit Findings _(2026-07-04, static code review — no live DB access used)_
- Session token hashing — confirmed shipped in `lib/auth.ts` (SHA-256 before storage/compare); roadmap updated 2026-07-22.
- `items.rawOcr` (text column, comment says "JSONB stored as text for simplicity") has no size cap and could carry incidental PII if OCR picks up more than the itemized receipt (e.g. stray card digits). Worth capping + reviewing what the OCR prompt actually extracts.
- A previously-attempted Neon MCP server (`~/.claude.json`, `@neondatabase/mcp-server-neon`) that would have given an AI agent direct live DB access is currently broken (dependency error) and was left disabled on purpose — do not re-enable without an explicit decision on PII exposure.

---

## P0 — Must ship

_All P0 items shipped. See Shipped section below._

---

## Planned

### Google AI OCR Reliability _(partial)_
Retry logic is shipped. Remaining UX issues:
- [x] Exponential backoff with 3 retries on Google AI API calls (`extractViaGoogleAI` in `app/api/receipts/route.ts`)
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

### Expiry & Cleanup ✓
_Shipped: 2026-06-24_

`split_tables.expires_at` is set but never enforced.
- [x] Cron job (Netlify scheduled function) to mark tables expired after 24h
- [x] Expired tables show a tombstone page

---

## V2 (Post-Auth)

### Cross-bill Balance
- [ ] Cross-bill balance with a friend ("you owe Arjun ₹X across 3 bills")

### Groups
- [ ] Create a named group (flat, roommates, team)
- [ ] One-tap "start a bill for this group" pre-populates participants
- [ ] Running group balance

---

## Shipped

### Bill History ✓
_Shipped: 2026-07-22_ · PR #11 (`6411566`) + PR #12 (`167dfbd`)

`GET /api/history` (paginated, cursor-based, 4-way parallel enrichment), `/history` page, `idx_split_tables_created_by` index on `splitTables`. Migration registered and applied.

### Table Page UX Fixes ✓
_Shipped: 2026-07-04_

Four independent fixes merged from separate worktrees, all touching `app/t/[shareCode]/page.tsx`:
- Async split submission for non-host participants (`feat/async-split-submission`) — new `splitsSubmittedAt` field, `POST /api/participants` and `GET /api/tables/[shareCode]` updated
- Snackbar instead of a persistent red validation banner on settle attempt (`fix/incomplete-snackbar`)
- Participant name strip collapses into a tappable counter (`fix/participant-counter-strip`)
- Share overlay no longer re-appears after the inline share step, and opens correctly from the header Share button (`fix/share-sheet-trigger`)

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
