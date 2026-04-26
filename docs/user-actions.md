# User Actions Required

Items that need your input or manual steps before features work correctly.

---

## 1. Schema migration: `editing` status (REQUIRED)

The `split_tables.status` column now allows `'editing'`. The existing database has a CHECK constraint that doesn't include it.

Run this once to push the updated schema:

```bash
npx drizzle-kit push
```

Until this is run, any call to the `reopen` API will fail with a DB constraint error.

---

## 2. Clerk Auth (BLOCKED on you)

Clerk integration is ready to implement but needs your API keys. Add to `.env.local`:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

Once provided, the Clerk auth + guest flow PRD (`docs/PRDs/clerk-auth-guest-flow.md`) can be implemented.

---

---

## 3. Infrastructure Security (REQUIRED — cannot be done in code)

### 3a. Put the site behind Cloudflare (STRONGLY RECOMMENDED)

Cloudflare Free tier gives you: WAF rules blocking common attacks (SQLi, XSS, path traversal), DDoS protection, bot scoring, and TLS termination.

Steps:
1. Move DNS to Cloudflare (add your domain, get Cloudflare nameservers, update at registrar)
2. Enable **WAF Managed Rules** — OWASP Core Rule Set
3. Set **SSL/TLS mode → Full (strict)**
4. Enable **Bot Fight Mode** (free tier)
5. Add a rate-limit rule: max 20 requests / 10s per IP to `/api/*` paths

Until Clerk auth is live, Cloudflare WAF is the primary protection against automated abuse of the unauthenticated API surface.

### 3b. Neon IP allowlisting

Neon supports database access restrictions. Until you need a DB from outside Netlify:
1. Go to Neon console → your project → **Settings → IP Allow**
2. Add Netlify's outbound IP ranges (or use Netlify IP restriction plugin)

This prevents direct DB access even if your DB credentials leak.

### 3c. Rotate API keys periodically

Keys that should be rotated at least quarterly:
- `GOOGLE_AI_STUDIO_API_KEY` — Google AI Studio console
- `OPENROUTER_API_KEY` — OpenRouter dashboard
- `DATABASE_URL` — Neon: rotate the connection string under **Branches → Reset password**

### 3d. Error monitoring (RECOMMENDED before public launch)

Currently, server errors are swallowed silently. Add Sentry to catch regressions:
```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```
Add `SENTRY_DSN` to Netlify env vars. This costs nothing under the free tier for the expected traffic volume.

---

## Decisions Made Autonomously

These were ambiguous in the PRDs — decisions recorded here for visibility.

### Settle directly from edit mode
**Decision:** Not implemented. In edit mode, the host sees "Done editing" (→ `items_ready`) and "Settle up →". Tapping "Settle up →" from edit mode goes through the pre-settle sheet as normal — the bill settles with current status `editing`, which is allowed since the pre-settle sheet calls `/api/ledger/compute` directly. This is the simpler path and matches normal UX.

**Alternative considered:** Block settle in edit mode and force "Done editing" first. Rejected — adds unnecessary friction.

### Phase state on host refresh
**Decision:** If the host refreshes the page after OCR completes (status already `items_ready`), the share sheet is skipped and items are shown directly. This matches the PRD's explicit "If page is reloaded after scan, skip straight to items" requirement.

### Non-host participant switcher in edit mode
**Decision:** Non-hosts can only edit their own selections in edit mode — no switcher shown. The host participant switcher is host-only. Non-hosts see a note: "Editing your selections — host will close edit mode when ready."

### Currency selector default
**Decision:** Currency is auto-detected from `navigator.language` and pre-selected in the dropdown. User can override before creating a bill. The selection is per-bill (stored in `split_tables.currency`).

### Ghost dots in share sheet
**Decision:** Show 3 ghost dots (dashed circles) for empty participant slots, giving visual feedback that more people can join. Minimum is 3 shown — if 3+ participants, only real dots shown.

### Tip on reopen
**Decision:** Tip (`split_tables.tip`) is NOT cleared on reopen. Ledger entries and payments are deleted, but the tip value persists. When host re-settles, they can adjust tip in the pre-settle sheet (which re-saves it).
