# khlaas — Architecture Overview

## System Diagram

```
Browser (PWA)
    │
    │  HTTPS
    ▼
Netlify Edge (Next.js App Router)
    │
    ├── /app/api/tables/*      ← CRUD for split tables
    ├── /app/api/receipts/*    ← upload trigger + async OCR job
    ├── /app/api/selections/*  ← item selection writes
    └── /app/api/ledger/*      ← settle + compute ledger
         │
         ├── Neon (PostgreSQL)              ← all persistent state
         │     └── ElectricSQL sync engine  ← real-time shapes to browsers
         │
         ├── Cloudflare R2                  ← receipt image storage
         │
         └── Netlify Background Function    ← async OCR pipeline (up to 15 min)
               │
               ├── Google Document AI receipt model   ← primary OCR
               ├── Gemma 4 (Google AI Studio)         ← vision fallback
               └── DeepSeek-V3                        ← text normalization fallback
```

## Real-Time Architecture: ElectricSQL

ElectricSQL syncs Postgres shapes to clients via HTTP long-polling / SSE. Every connected browser subscribes to the shapes it cares about; changes in Neon propagate automatically.

```
Neon (PostgreSQL)
    │
    │ logical replication
    ▼
ElectricSQL sync engine
    │
    │ HTTP/SSE (CDN-cacheable)
    ▼
Browser clients (shape subscriptions)

Shapes in use:
  split_tables  WHERE id = '{tableId}'      ← status transitions (processing → ready → settled)
  items         WHERE table_id = '{tableId}' ← receipt line items appear as OCR completes
  participants  WHERE table_id = '{tableId}' ← presence (who has joined)
  selections    WHERE item_id IN (SELECT id FROM items WHERE table_id = '{tableId}')
                                             ← live selection updates from all participants
```

All real-time state flows through Neon as the single source of truth. No separate event bus needed.

## Key Flows

### 1. Create Table + Scan Receipt

```
1.  Host opens app → POST /api/tables → {tableId, shareCode}
2.  Host takes photo → PUT image to Cloudflare R2 presigned URL
3.  POST /api/receipts/process → triggers Netlify Background Function → returns 202 immediately
4.  Background Function:
      a. Fetch image from R2
      b. Preprocess (deskew, CLAHE) with sharp
      c. Run Google Document AI receipt model
      d. Confidence < 85% OR missing total? → run Gemma 4 (image → JSON)
      e. Still failing? → run DeepSeek-V3 on raw OCR text
      f. Parse items + fees → bulk insert into `items` table in Neon
      g. UPDATE split_tables SET status = 'items_ready'
5.  ElectricSQL detects status change → pushes to all subscribed clients
6.  Host's browser receives update → renders item list
```

### 2. Join Table + Select Items

```
1.  Guest opens /t/{shareCode}
2.  GET /api/tables/{shareCode} → table + items (from Neon)
3.  Guest enters display name → POST /api/participants → {participantId, sessionToken}
    (sessionToken stored in localStorage)
4.  Guest subscribes to ElectricSQL shapes for this tableId
5.  Guest taps checkbox:
      a. Optimistic update: check immediately in local state
      b. POST /api/selections → {participantId, itemId} (header: X-Session-Token)
      c. Server validates sessionToken matches participants row
      d. INSERT into selections
      e. ElectricSQL syncs new row to all participants instantly
      f. On error: revert local state + show toast
```

### 3. Settle Table

```
1.  Host clicks "Settle Up"
2.  POST /api/ledger/compute → server-side calculation:
      a. Per item: cost / number of selectors → assign to each selector
      b. Per fee: distribute proportional to participant subtotals
      c. Debt simplification: minimize transaction count
      d. Bulk insert into ledger_entries
      e. UPDATE split_tables SET status = 'settled'
3.  ElectricSQL pushes status change to all participants
4.  All browsers transition to the settle screen showing final amounts
```

## V1 Auth Model (No Accounts)

- Tables identified by UUID + short `share_code` for the URL
- Participant identity: `{participantId, sessionToken}` generated client-side, stored in `localStorage`
- `sessionToken` passed as `X-Session-Token` request header for write operations
- Server validates `sessionToken` matches the `participants` row before allowing selection writes
- No JWT, no OAuth — pure ephemeral session

## V2 Auth Migration (Lucia Auth)

When Lucia Auth is added:
- `participants.user_id` FK to the `users` table becomes populated for logged-in users
- Write endpoints check `auth.userId === participants.user_id`
- Anonymous V1 sessions can be "claimed" by a logged-in user (link session_token → user_id)
- Lucia manages session cookies; Neon stores the session table
- No schema changes to core tables — designed for this migration from day one

## Background Job: OCR Pipeline

Netlify Background Functions are fire-and-forget with up to 15 minutes runtime — sufficient for all OCR paths including retries.

```
POST /api/receipts/process
    │
    ├── Returns 202 { jobId } immediately
    │
    └── Triggers /.netlify/functions/ocr-process-background
            │
            ├── Download image from R2
            ├── sharp preprocessing
            ├── Google Document AI call
            ├── Confidence check → Gemma 4 if needed
            ├── DeepSeek-V3 if Gemma 4 rate-limited
            ├── INSERT items into Neon
            └── UPDATE split_tables status → ElectricSQL propagates to clients
```

If Netlify Background Functions are unavailable on the current plan, drop in **Upstash QStash** (~$1/month for 100k messages) with identical logic.

## Cost Breakdown at 10k Tables/Month

| Service | Cost | Notes |
|---|---|---|
| Neon | ~$2 | ~100k queries, 1GB storage |
| Google Doc AI | ~$75 | 500 free + $0.01 × 7,500 |
| Gemma 4 | $0 | Free tier (1,500 req/day) |
| DeepSeek-V3 | ~$0.20 | ~200 fallback receipts |
| Cloudflare R2 | ~$2 | 10GB storage, 0 egress |
| Netlify | $0 | Free tier |
| ElectricSQL | ~$0.10 | ~100k writes |
| **Total** | **~$79/month** | vs ~$90 with original stack |
