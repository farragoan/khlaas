# PRD: API Rate Limiting Middleware

**Priority:** P1
**Status:** Planned
**Last updated:** 2026-04-26

---

## Problem

All API routes are currently unprotected from automated abuse. A script can:
- Flood `/api/receipts` to exhaust Google AI API credits (each call costs money)
- Brute-force session tokens across tables (nanoid(32) is strong, but no throttle)
- Spam `/api/participants` to fill a table with fake participants

Cloudflare WAF (see `docs/user-actions.md`) handles some of this at the CDN layer, but we also need in-process protection for dev environments and for requests that bypass CDN.

---

## Goals

- Rate limit expensive endpoints (`/api/receipts`, `/api/participants`) per IP
- Rate limit all API routes as a baseline
- Work in the Netlify serverless environment (no in-memory state between invocations)
- Not block legitimate users on mobile networks (shared IPs)

---

## Approach

Use **Upstash Redis** for distributed rate limiting with `@upstash/ratelimit`:

```bash
npm install @upstash/ratelimit @upstash/redis
```

Upstash has a free tier (10k requests/day). The `Ratelimit.slidingWindow` algorithm handles mobile shared IPs better than fixed windows.

### Limits

| Endpoint | Window | Max requests |
|---|---|---|
| `POST /api/receipts` | 1 minute | 3 per IP |
| `POST /api/participants` | 1 minute | 10 per IP |
| `POST /api/tables` | 1 minute | 5 per IP |
| All other `/api/*` | 1 minute | 60 per IP |

### Implementation

Create `middleware.ts` at the repo root:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, "1 m"),
});

const strictLimits: Record<string, [number, string]> = {
  "/api/receipts": [3, "1 m"],
  "/api/participants": [10, "1 m"],
  "/api/tables": [5, "1 m"],
};

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const path = request.nextUrl.pathname;

  const limitEntry = Object.entries(strictLimits).find(([p]) => path.startsWith(p));
  const limiter = limitEntry
    ? new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(...limitEntry[1] as [number, string]) })
    : ratelimit;

  const { success } = await limiter.limit(`${ip}:${path}`);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
```

### Env vars required (user action)

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## Acceptance Criteria

- [ ] Install `@upstash/ratelimit` and `@upstash/redis`
- [ ] `middleware.ts` intercepts all `/api/*` routes
- [ ] `/api/receipts` limited to 3 req/min/IP
- [ ] `/api/participants` limited to 10 req/min/IP
- [ ] Exceeding limit returns `429 Too Many Requests`
- [ ] Rate limiting does not block legitimate single-session use
- [ ] Works locally (can use in-memory store in dev if Upstash not configured)
- [ ] Upstash env vars documented in `docs/user-actions.md`

---

## Dependencies

- Upstash account (free tier sufficient)
- `@upstash/ratelimit`, `@upstash/redis` packages
