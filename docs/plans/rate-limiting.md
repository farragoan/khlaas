# Feature: API rate limiting

## Context
khlaas is a Next.js app (App Router) with API routes under `app/api/**`. Full PRD already exists at `docs/PRDs/security-rate-limiting.md` — read it first, it has the target design (Upstash + `@upstash/ratelimit`, sliding window, per-route limits table). This plan operationalizes that PRD with a few adjustments for what's actually feasible right now.

Current `middleware.ts`:
```ts
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```
It's passive Clerk-only today. Rate limiting must be layered inside/alongside this, not replace it — Clerk's auth context enrichment must keep working on every route it currently runs on.

**Important constraint:** Upstash Redis is not provisioned yet (no account, no env vars) — provisioning it is a user action tracked separately in `docs/user-actions.md`. This means the middleware must work correctly with **zero** Upstash env vars configured: fail open to an in-memory fallback limiter rather than crashing or silently disabling limiting. Do not attempt to create an Upstash account or add real credentials — just make the code correct and safe for when they're added later.

## Goals
- Rate limit abuse-prone endpoints per the PRD's table:
  | Endpoint | Window | Max requests |
  |---|---|---|
  | `POST /api/receipts` | 1 minute | 3 per IP |
  | `POST /api/participants` | 1 minute | 10 per IP |
  | `POST /api/tables` | 1 minute | 5 per IP |
  | All other `/api/*` | 1 minute | 60 per IP |
- Exceeding the limit returns `429` with a small JSON body `{ "error": "Too many requests" }`.
- Works with no Upstash env vars configured (dev/local) via an in-memory sliding-window fallback — same interface, swappable later.
- When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` **are** set, use real `@upstash/ratelimit` + `@upstash/redis`.
- Clerk's existing passive middleware behavior must be unchanged for every route it currently touches.

## Implementation

### 1. Install dependencies
```bash
npm install @upstash/ratelimit @upstash/redis
```

### 2. `lib/rate-limit.ts` (new file)
A small module exporting a `checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean>` (returns `true` if allowed) that:
- If `process.env.UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are both set, lazily construct a `Redis.fromEnv()` client and an `Ratelimit.slidingWindow` limiter per (limit, window) pair, cached by key so repeated calls don't reconstruct the limiter.
- Otherwise, fall back to a simple in-process sliding-window counter (a `Map<string, number[]>` of timestamps, pruning expired entries) — good enough for local dev and single-instance environments, not correct across serverless cold starts/multiple instances, which is an acceptable known limitation (document it in a one-line comment).

### 3. `middleware.ts`
Wrap the existing `clerkMiddleware()` call so rate limiting runs first for `/api/*` paths, then falls through to Clerk's existing behavior unchanged for everything else (including the rest of `/api/*` after the limit check passes). Use `clerkMiddleware(async (auth, req) => { ... })` form to inject the rate-limit check without losing Clerk's context enrichment. Look up `clerkMiddleware`'s callback signature in `node_modules/@clerk/nextjs` types before writing this — do not guess the API shape blindly, since this project's `AGENTS.md` warns dependency versions may differ from training data.

Route → limit mapping (first match wins, by path prefix):
- `/api/receipts` → 3 req/min per IP
- `/api/participants` → 10 req/min per IP
- `/api/tables` (POST only — creating tables; GET reads should not be limited this strictly) → 5 req/min per IP
- everything else under `/api/` → 60 req/min per IP

IP extraction: `request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"`.

Keep the existing `config.matcher` — do not change what paths the middleware runs on, only what it does for `/api/*` paths within it.

### 4. Env var documentation
Add to `docs/user-actions.md` (read it first for existing formatting conventions) a short section noting `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are needed for production-grade distributed rate limiting, with a one-line note that the code degrades gracefully (in-memory, per-instance) without them.

## Constraints
- No live Upstash account creation, no real credentials — code must work correctly with the env vars absent.
- Do not touch auth/payment logic, ledger computation, or any file outside `middleware.ts`, `lib/rate-limit.ts`, `package.json`/`package-lock.json` (via npm install), and `docs/user-actions.md`.
- Do not remove or weaken Clerk's existing middleware behavior on any route.
- Keep diffs minimal and scoped.

## Verification before finishing
- `npx tsc --noEmit` must pass with no new errors.
- Manually trace through the logic for: (a) no env vars set — confirm in-memory path is used and doesn't throw; (b) a request to `/api/receipts` — confirm it maps to the 3/min limit, not the 60/min default; (c) a non-`/api` route (e.g. `/t/abc123`) — confirm rate limiting is skipped entirely and Clerk still runs as before.
- Read back `middleware.ts` and `lib/rate-limit.ts` once complete to confirm correctness.

## When done
- `git add` only the files listed in Constraints above (plus `package.json`/`package-lock.json` if `npm install` touched them) — do not add this plan file itself, do not add unrelated files.
- Commit with a descriptive message ending in a blank line + `Co-Authored-By: Mimo <noreply@mimo>`.
- Push the branch: `git push -u origin feat/api-rate-limiting`.
- Do not open a pull request — just push the branch.

## Post-implementation note
Mimo's first pass ran `pnpm install` instead of `npm install`, adding an unused `pnpm-lock.yaml` (this project uses `package-lock.json` exclusively). Fixed in a follow-up commit on the same branch before merging.
