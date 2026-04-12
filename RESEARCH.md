# khlaas — Technical Literature Review

> OCR-powered per-item bill splitting: scan a receipt, everyone selects what they ate, we do the math.

---

## Product Overview

**Core flow (V1):**
1. User photos a restaurant bill
2. OCR extracts line items (name + price), subtotal, tax, service charges
3. User creates a **table** (split session) — generates a shareable link
4. Each person joins the link and taps the dishes they ate (multiselect)
5. App calculates each person's exact share: their items + proportional share of fees
6. Records a "who owes who" ledger — no payment processing in V1

**Roadmap:**
- **V1** — Single bill split, no accounts, join by link (ephemeral)
- **V2** — Persistent ledger across bills, user accounts (Lucia Auth)
- **V3** — Long-running groups (Splitwise-style), continuous group splits
- **V4** — Expo/React Native mobile app, shared monorepo with web

---

## 1. OCR Approaches

### Decision Matrix

| Approach | Cost/receipt | Accuracy on restaurant bills | Structured output | Latency | Notes |
|---|---|---|---|---|---|
| Tesseract 5.x | Free | 60–80% raw, ~90% with preprocessing | ❌ (raw text) | 1–3s CPU | Needs heavy post-processing |
| PaddleOCR PP-OCRv4 | Free | ~94% word-level (SROIE benchmark) | Partial (PPStructure) | 2–5s CPU, 200–500ms GPU | Best open-source option |
| Google Vision API | $0.0015 | Excellent | ❌ (bounding boxes only) | 1–2s | No receipt semantics |
| AWS Textract AnalyzeExpense | $0.01 | ~92–97% on prices, ~80% on item names | ✅ (ITEM, PRICE, TAX, TOTAL) | 2–4s | Good but expensive |
| Azure Document Intelligence | $0.01 (500 free/mo) | ~92% field F1 | ✅ (prebuilt-receipt model) | 2–4s | Better on European receipts |
| **Google Document AI receipt** | **$0.01 (500 free/mo)** | **~93–96%** | **✅ (structured fields)** | **2–4s** | **Best free tier; Google infra** |
| Claude 3.5 Haiku | ~$0.0036 | 90–97% + semantic normalization | ✅ (prompt → JSON) | 1–4s | Replaced by Gemma 4 |
| **Gemma 4 (Google AI Studio)** | **~$0 (free tier)** | **90–96% + semantic normalization** | **✅ (prompt → JSON)** | **1–4s** | **1,500 req/day free; multimodal** |
| **DeepSeek-V3** | **~$0.001** | **N/A (text normalization only)** | **✅ (structured JSON)** | **1–3s** | **3.5× cheaper than Haiku; no vision** |
| GPT-4o-mini | ~$0.001–0.003 | Similar to Haiku | ✅ | 2–5s | |

### Recommended Approach: Hybrid (Google Doc AI + Gemma 4 fallback)

```
Phone image
    │
    ▼
Client-side preprocessing (deskew, CLAHE, binarize)  ← sharp
    │
    ▼
Google Document AI receipt model  (500 free/month, then $0.01/receipt)
    │
    ├─ Confidence ≥ 85% AND total field present? ──► Return structured items
    │
    └─ Low confidence OR missing total OR item count = 0?
            │
            ▼
        Gemma 4 via Google AI Studio  (~$0 free tier, 1,500 req/day)
        Send image → prompt for structured JSON
            │
            ├─ Success ──► Return structured items
            │
            └─ Rate limited?
                    │
                    ▼
                DeepSeek-V3  (~$0.001/receipt)
                Send raw OCR text → normalize to JSON
                (text-only; no vision — use as last resort)
```

**Fallback triggers:**
- Any field confidence < 85 (Google Doc AI provides per-field scores)
- `total` field missing from summary
- Sum of extracted item prices differs from total by > 5%
- Item count = 0

**Why Gemma 4 over Claude Haiku:**
- Free up to 1,500 requests/day via Google AI Studio (khlaas V1 traffic will be well within this)
- Multimodal — can process the receipt image directly, same as Haiku
- When rate-limited, DeepSeek-V3 is ~3.5× cheaper than Haiku for text normalization ($0.27/M input vs $0.80/M input)
- Both are accessible without AWS account setup

**Why DeepSeek-V3 (not DeepSeek-VL2 or similar vision models):**
- DeepSeek's vision models are not production-grade for structured receipt extraction
- DeepSeek-V3 excels at text: given raw OCR output, it normalizes "CHKN PAD TH × 2 14.00" → `{"name": "Chicken Pad Thai", "quantity": 2, "unit_price": 7.00}` reliably and cheaply
- Use it only after a vision model has already done the heavy lifting

**Economics at 10,000 receipts/month:**
- 80% via Google Doc AI (within free 500 + paid): ~$75 (after free tier)
- 18% via Gemma 4 (free tier): $0
- 2% via DeepSeek-V3 fallback: ~$0.20
- **Total OCR cost: ~$75/month at 10k receipts** (vs $86 originally)
- **At < 500 receipts/month: $0 OCR cost entirely**

### Google Document AI — Output Structure

```json
{
  "document": {
    "entities": [
      {"type": "line_item/description", "mentionText": "Pad Thai", "confidence": 0.94},
      {"type": "line_item/amount", "mentionText": "12.50", "confidence": 0.99},
      {"type": "total_amount", "mentionText": "27.63", "confidence": 0.98},
      {"type": "total_tax_amount", "mentionText": "1.13", "confidence": 0.97}
    ]
  }
}
```

SDK: `@google-cloud/documentai` → `DocumentProcessorServiceClient`

### Gemma 4 Fallback — Prompt

```
Extract all line items from this receipt image. Return JSON only, no other text:
{
  "items": [{"name": string, "quantity": number, "unit_price": number, "total_price": number}],
  "subtotal": number | null,
  "tax": number | null,
  "service_charge": number | null,
  "other_fees": [{"name": string, "amount": number}],
  "total": number | null
}
```

API: Google AI Studio generative API with `gemma-4` model, `inlineData` for the image.

### DeepSeek-V3 Text Normalization — Prompt

```
Given this raw OCR text from a restaurant receipt, extract structured data. Return JSON only:
{
  "items": [{"name": string, "quantity": number, "unit_price": number, "total_price": number}],
  "subtotal": number | null,
  "tax": number | null,
  "service_charge": number | null,
  "total": number | null
}

Raw OCR text:
<paste raw text here>
```

API: DeepSeek API, `deepseek-chat` model (DeepSeek-V3). ~$0.27/M input, $1.10/M output.

### Image Preprocessing Pipeline

Required for Google Doc AI accuracy; reduces fallback rate:

1. **Perspective warp** — correct receipt held at angle
2. **Grayscale**
3. **CLAHE** — handle uneven restaurant lighting
4. **Sauvola adaptive threshold** — outperforms Otsu on thermal receipts
5. **Morphological dilation** — reconnect broken thermal print characters
6. **Upscale to 300 DPI** if below threshold

**Node.js implementation:** `sharp` (preprocessing) — runs in Netlify Background Function alongside the OCR call.

### Open-Source Datasets & Fine-Tuned Models

| Resource | Description | Relevance |
|---|---|---|
| [CORD dataset](https://github.com/clovaai/cord) | 11,000 SE Asian restaurant receipts, 30 semantic fields | Direct — matches khlaas restaurant use case |
| [SROIE (ICDAR 2019)](https://rrc.cvc.uab.es/?ch=13) | 1,000 receipts, key-value labels | Benchmark standard |
| [LayoutLMv3](https://arxiv.org/abs/2204.08387) | Transformer: text + layout + image | State-of-the-art if self-hosting |
| [Donut (Clova)](https://arxiv.org/abs/2111.15664) | End-to-end: image → JSON, no separate OCR | `naver-clova-ix/donut-base-finetuned-cord-v2` on HuggingFace |
| PaddleOCR PP-OCRv4 | Open-source, DBNet + CRNN/SVTR | Best open-source if avoiding all per-call costs |

**V2 self-hosted path:** Fine-tune Donut on CORD + labeled khlaas receipts → deploy on a $50/month GPU instance → eliminates all per-call OCR costs at scale.

---

## 2. Web App Tech Stack

### Recommended Stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) | PWA support, colocated API routes, V4 React Native transition |
| **Styling** | Tailwind CSS + shadcn/ui | Fast UI iteration, accessible components, no runtime CSS overhead |
| **Real-time sync** | ElectricSQL | Apache 2.0, HTTP/SSE shapes on Postgres, reads free/unlimited |
| **Database** | Neon (serverless Postgres) | Apache 2.0 core, free tier, schema-compatible, Databricks-backed |
| **Auth** | None (V1) → Lucia Auth (V2) | Fully open-source, framework-agnostic |
| **OCR** | Google Doc AI + Gemma 4 fallback + DeepSeek-V3 | Cheapest viable pipeline |
| **Image storage** | Cloudflare R2 | Zero egress fees |
| **Background jobs** | Netlify Background Functions | No extra dependency; up to 15 min runtime |
| **Hosting** | Netlify | GitHub Actions integration, generous free tier |
| **Animation** | AutoAnimate + Framer Motion | 2kb for lists, transitions for flows |
| **Monorepo (V4)** | Turborepo + pnpm workspaces | Web + Expo shared business logic |

### Database: Neon vs Supabase

| Option | Type | OSS | Real-time | Free tier | Monthly @ 10k tables |
|---|---|---|---|---|---|
| **Neon** | Serverless Postgres | ✅ Apache 2.0 | via ElectricSQL | 0.5GB, 100 CU-hours | ~$2–5 |
| Supabase | Postgres | Partial | Built-in | 500MB, 2GB egress | $25 |
| PlanetScale | MySQL | ❌ | ❌ | Paid only | — |
| Turso | SQLite (libSQL) | ✅ Apache 2.0 | No native sync | 5GB, 500M rows/mo | ~$0 |

**Why Neon over Turso:** The schema is standard Postgres SQL with `NUMERIC`, `TIMESTAMPTZ`, `GENERATED ALWAYS AS STORED`, and will need Postgres for ElectricSQL sync. Turso is SQLite-compatible and would require schema changes. Neon is a drop-in for the existing schema.

**Why Neon over Supabase:**
- Neon's core (serverless Postgres + storage) is Apache 2.0; Supabase bundles proprietary platform features
- ~5–10× cheaper at V1/V2 scale
- Databricks acquisition (2025) = strong long-term backing
- ElectricSQL for realtime is more scalable than Supabase Realtime (CDN-scale reads, free fan-out)
- Not locked into a bundled platform — each layer is replaceable

### Real-Time: ElectricSQL

ElectricSQL syncs Postgres "shapes" (subsets of rows) to clients via HTTP long-polling / SSE. The browser receives real-time updates whenever matching rows change.

**Why ElectricSQL over Supabase Realtime:**
- Reads and fan-out are **free and unlimited** (CDN-cacheable)
- $1 per 1M writes (at 10k receipts/month: ~100k writes → $0.10)
- Apache 2.0, self-hostable
- Works with any Postgres — not tied to a platform
- SSE/HTTP is more reliable than WebSockets at scale (no connection management)

```typescript
// Subscribe to all selections for a table — updates in real-time
const { data: selections } = useShape({
  url: `${ELECTRIC_URL}/v1/shape`,
  params: {
    table: 'selections',
    where: `item_id IN (SELECT id FROM items WHERE table_id = '${tableId}')`
  }
})

// Subscribe to participant presence
const { data: participants } = useShape({
  url: `${ELECTRIC_URL}/v1/shape`,
  params: { table: 'participants', where: `table_id = '${tableId}'` }
})
```

ElectricSQL events map to the original architecture:
- `selection:added` / `selection:removed` → shape update on `selections`
- `participant:joined` → shape update on `participants`
- `receipt:ready` → shape update on `split_tables` (status field change)
- `table:settled` → shape update on `split_tables` (status = 'settled')

### Camera Access in PWA

**V1 — `<input capture>` (maximum compatibility):**
```html
<input type="file" accept="image/*" capture="environment" />
```
Triggers rear camera directly. Works on iOS Safari 14.5+, all Android Chrome. Zero JS.

**V2 — `getUserMedia` for live preview:**
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment', width: { ideal: 1920 } }
})
```
Use `react-webcam` to abstract. Enables live preview + auto-capture.

### Image Storage: Cloudflare R2

| Service | Storage | Egress | Notes |
|---|---|---|---|
| **Cloudflare R2** | $0.015/GB/mo | **Free** | S3-compatible API |
| Supabase Storage | $0.021/GB/mo | $0.09/GB | Simpler integration |
| AWS S3 | $0.023/GB/mo | $0.09/GB | Standard |

Use `@aws-sdk/client-s3` pointed at R2 endpoint — S3-compatible, zero code difference.

**Receipt lifecycle:** Delete raw images after 30 days. Retain only the structured JSON.

### Background Jobs: Netlify Background Functions

OCR takes 3–10 seconds. Netlify Background Functions run up to 15 minutes — no external job queue needed for V1.

```
Client → POST /api/receipts/upload → {jobId, uploadUrl}   (regular function, <10s)
Client → PUT image to R2 presigned URL
Client → POST /api/receipts/process → triggers Background Function → returns 202 immediately
Netlify BG Function → runs OCR → writes items to Neon DB
ElectricSQL → syncs split_tables status change to all clients
Client → sees status transition → renders item list
```

Fallback if Background Function limits are hit: **Upstash QStash** ($1/month for 100k messages) — same pattern, minimal cost.

### Infrastructure Cost Comparison

**Original stack (Supabase + Vercel + Textract + Inngest):**

| Scale | Supabase | Textract | R2 | Vercel | Inngest | Total |
|---|---|---|---|---|---|---|
| 1,000 tables/mo | Free | ~$10 | ~$0.50 | Free | Free | **~$11** |
| 10,000 tables/mo | Free | ~$86 | ~$2 | Free | Free | **~$90** |
| 100,000 tables/mo | $25 | ~$860 | ~$15 | $20 | $0 | **~$920** |

**Revised stack (Neon + Netlify + Google Doc AI + ElectricSQL):**

| Scale | Neon | OCR | R2 | Netlify | Electric | Total |
|---|---|---|---|---|---|---|
| 1,000 tables/mo | Free | $0 (within free tiers) | ~$0.50 | Free | ~$0 | **~$1** |
| 10,000 tables/mo | ~$2 | ~$75 | ~$2 | Free | ~$0.10 | **~$79** |
| 100,000 tables/mo | ~$15 | ~$750 | ~$15 | Free | ~$1 | **~$781** |

---

## 3. Table Feature Architecture

### 3.1 Ephemeral vs Persistent

Tables use **soft-expiry**:
- Default TTL: 7 days after last activity
- Netlify scheduled function (cron) marks `status = 'expired'`
- On expiry: receipt image deleted from R2, structured data retained in Neon
- Users can "close" a table manually (triggers ledger computation)
- V2: closed tables attach to user profile for history

### 3.2 Item Selection: Non-Exclusive, Additive

- Multiple people can select the same item → cost split equally among all who selected it
- No conflict resolution needed — each participant has their own `selections` rows
- ElectricSQL shape subscription ensures all clients see each other's selections in real-time

**Optimistic UI:**
1. Tap checkbox → local state updates immediately
2. POST `/api/selections` fires in background
3. ElectricSQL syncs the new row to all participants
4. On error: revert state + toast

### 3.3 Database Schema

See [schema.sql](./schema.sql) for the full annotated schema.

Core tables:
- `split_tables` — bill split sessions
- `items` — line items from OCR
- `participants` — anonymous in V1, linked to accounts in V2
- `selections` — who ate what (many-to-many)
- `ledger_entries` — final settlement (computed on settle)

### 3.4 Ledger Computation Algorithm

```
1. For each non-fee item:
   selectors = participants who selected this item
   per_person_share = item.total_price / selectors.count
   assign share to each selector

2. For each fee item (tax, service_charge, tip):
   each participant pays: fee.amount × (participant_subtotal / grand_subtotal)

3. Debt simplification (minimize transaction count):
   net_balances = {participant_id: net_amount_owed}
   while creditors and debtors remain:
     match largest debtor with largest creditor
     record payment, reduce balances
     insert into ledger_entries
```

This is pure business logic with no I/O — the first target for TDD.

---

## 4. Testing Strategy

**Test runner:** Vitest + `@vitest/coverage-v8`

**Coverage gates (enforced in CI):**
- `lib/ledger/*` — 100% (pure functions, highest business value)
- `lib/ocr/*` — 100% (parsing/validation logic)
- Overall — 80% minimum

**TDD priority order:**
1. `lib/ledger/compute.ts` — the split algorithm (write tests first)
2. `lib/ocr/parse.ts` — normalize Google Doc AI / Gemma 4 output to internal schema
3. `lib/ocr/validate.ts` — confidence threshold checks and fallback triggers
4. API route handlers (integration tests with Neon test branch)

Neon's database branching is ideal for integration tests: spin up an isolated branch per test run, migrate, run, drop.

---

## 5. Animation

**AutoAnimate** (`@formkit/auto-animate`, ~2kb):
- Wrap the item list container — selections animate in/out automatically
- Zero configuration, zero performance cost
- Perfect for collaborative real-time selection UX

**Framer Motion** (`framer-motion`, ~35kb gzipped):
- Page transitions: upload → processing → selection → settle
- Participant join animation (avatar slides in from edge)
- Settle reveal (amounts count up with spring physics)
- Checkbox spring interaction

**Tailwind built-in (zero JS):**
- `animate-pulse` — OCR processing state
- `animate-spin` — upload spinner
- `transition-colors duration-150` — all interactive elements

Skip GSAP, Lottie, Anime.js for V1.

---

## 6. UI Design Direction

Designed for **low-light restaurant environments on mobile**:

```
Colors:
  Background:  #0F0F0F (near-black — looks great at dinner tables)
  Surface:     zinc-900 / zinc-800 cards
  Brand:       amber-400 (#FBBF24) — warmth, food association
  Text:        zinc-50 primary, zinc-400 secondary
  Selected:    emerald-400 (item claimed state)
  Danger:      red-400

Typography:
  Display: Geist (Next.js default)
  Prices:  tabular-nums (font-variant-numeric) — columns align

Touch targets:
  All interactive elements ≥ 44px height
  Item rows: 56px — large enough to tap confidently at a loud dinner table
```

---

## 7. Roadmap

### V1 — Single Bill, No Accounts (~2 months)
- Table join by UUID link (`/t/{uuid}`) — no auth
- Participant identity: `localStorage` + session token `{participantId, displayName}`
- OCR: Google Doc AI + Gemma 4 fallback via Netlify Background Function
- Real-time selection via ElectricSQL shapes
- Ledger computation on demand
- Neon RLS: tables readable by anyone; selections writable with valid `session_token`

### V2 — Persistent Ledger (~2 months after V1)
- Lucia Auth: email magic link + Google OAuth
- `participants.user_id` FK populated for logged-in users
- `contacts` table: user → user relationships with running balance
- Dashboard: "You owe Alex $47 across 3 bills"
- Push notifications via web push (service worker)

### V3 — Long-Running Groups (~3 months after V2)
- `groups` table with members
- `split_tables.group_id` FK
- Group-level debt simplification across all bills
- Recurring split templates

### V4 — Mobile App (Expo)
- Turborepo monorepo: `apps/web` (Next.js) + `apps/mobile` (Expo)
- Shared: `packages/core` (ledger calc, API client, Zod schemas), `packages/ui` (design tokens)
- Camera: `expo-camera` on mobile
- Navigation: `expo-router`
- Styling: NativeWind (Tailwind for React Native)

---

## 8. Competitive Landscape

| App | OCR | Per-item selection | Real-time collab | Web PWA | No account needed |
|---|---|---|---|---|---|
| **khlaas** | ✅ (Doc AI + Gemma 4) | ✅ | ✅ | ✅ | ✅ (V1) |
| Splitwise | Partial (total only) | ❌ | ❌ | ✅ | ❌ |
| Tricount | ❌ | ❌ | ❌ | ✅ | ✅ |
| Settle Up | ✅ (ML Kit, native only) | ✅ (sequential) | ❌ | ❌ | ❌ |
| Tab | ✅ | ✅ | ✅ | ❌ (native only) | ❌ |

---

## 9. Key References

- [CORD dataset paper](https://arxiv.org/abs/2103.10213)
- [SROIE competition](https://rrc.cvc.uab.es/?ch=13)
- [LayoutLMv3](https://arxiv.org/abs/2204.08387)
- [Donut (OCR-free)](https://arxiv.org/abs/2111.15664)
- [PaddleOCR PP-OCRv4](https://arxiv.org/abs/2309.03799)
- [HuggingFace: Donut on CORD](https://huggingface.co/naver-clova-ix/donut-base-finetuned-cord-v2)
- [Google Document AI receipt model](https://cloud.google.com/document-ai/docs/receipt-parser)
- [Gemma 4 on Google AI Studio](https://ai.google.dev/gemma)
- [DeepSeek-V3 API](https://platform.deepseek.com/docs)
- [ElectricSQL](https://electric-sql.com)
- [Neon serverless Postgres](https://neon.tech)
- [Lucia Auth](https://lucia-auth.com)
- [PaddleOCR GitHub](https://github.com/PaddlePaddle/PaddleOCR)
- [AutoAnimate](https://auto-animate.formkit.com)
- [Framer Motion](https://www.framer.com/motion)
