# Engineering rules for khlaas

Every rule here exists because the thing it forbids already shipped and already
broke. The failure is named next to each one. Rules without a named failure do
not belong in this file.

---

## 1. Never swallow an error

**What broke:** `app/api/receipts/route.ts` wrapped its OCR call in
`catch { return 502 }` with no error binding. Google retired
`gemini-2.5-flash-lite` underneath us, every scan started 404ing, and the
generic "Failed to process the image" made a dead model look exactly like a
blurry photo. It went unnoticed for days and was only found because a user
pasted a Cloudflare error page into chat.

- A `catch` in an API route or a server function **must** bind the error and
  `console.error` it before returning. Netlify keeps function logs; an
  unlogged failure is unrecoverable.
- `catch { }` with no body is only acceptable for a genuinely optional read
  where failure has no consequence (e.g. `JSON.parse` of a localStorage cache).
  Comment *why* it is optional, on the line.
- `.catch(() => {})` on a fire-and-forget write is a decision, not a default.
  If losing that write would confuse the user, it is not fire-and-forget.
- The user-facing message can stay friendly. The log must not.

```ts
// no
try { ... } catch { return NextResponse.json({ error: "Something went wrong" }, { status: 500 }); }

// yes
try { ... } catch (err) {
  console.error("what was being attempted:", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
```

## 2. Pin external models and versions — then own the pin

**What broke:** the Gemini model ID above. Pinning was the right call (a silent
model swap under a schema-constrained extraction is worse than a loud 404), but
a pin nobody revisits is a time bomb.

- Pin exact versions of third-party models and APIs. Do not use `-latest`
  aliases for anything whose output shape we depend on.
- Every pin carries a comment saying it is a pin and what to check when it
  fails.
- **Verify a model ID against the live API before shipping it.** `curl` the
  endpoint with the real key and the real request shape. Being listed in
  `/models` is not proof it is callable — `gemini-2.5-flash-lite` was listed and
  still returned 404.

## 3. Schema, migrations and the database are one thing

**What broke:** migration files existed on disk that were never registered in
`drizzle/meta/_journal.json`, so they applied to nobody. The app then ran
against columns that did not exist, and the workaround was a `.catch()` in
`app/api/tables/[shareCode]/route.ts` that silently re-queried without them.
Separately, a missing unique index let 9 duplicate `(table_id, user_id)` pairs
accumulate, silently corrupting the ledger on three real bills.

- Generate migrations with `drizzle-kit generate`. Never hand-write a `.sql`
  file into `drizzle/` — it will not be journalled. CI now fails if the counts
  disagree.
- A schema change is not done until it is applied to the database. Check
  `drizzle.__drizzle_migrations` before assuming.
- **Never paper over a missing column with a fallback query.** If the code needs
  a column the DB does not have, the deploy is broken — fail loudly and migrate.
- Constraints that protect money (unique, check, FK) go in the schema, not in
  application code. Application-level uniqueness loses every race.

## 4. Anything that touches money needs a test

**What broke:** OCR reported a receipt's `SubTotal` under `other_fees`; it was
inserted as a shared fee, added on top of the items it summarised, and split
across everyone. One bill read ₹35,317 for an ₹18,089 meal.

- One implementation of each calculation. The CSV export and the settle screen
  both read `computeBreakdown` for exactly this reason.
- A test for a money filter must cover **both** directions. Dropping a real
  charge costs as much as keeping a fake one — see
  `app/api/receipts/total-line.test.ts`.
- Never trust a number that came from a model. Validate its shape *and* its
  relationship to the other numbers.

## 5. Write guards where the write happens

**What broke:** expired bills were "locked" — except `selections`, `receipts`,
`close-edit` and `reopen` checked the status while `participants`, `payments`,
`ledger/compute` and `tables PATCH` did not. The host could settle a bill from
last month, and any signed-in visitor who opened an old link was silently
auto-joined onto its roster.

- A state check on some write routes is not a lock. When adding one, enumerate
  **every** route that writes to that table and check them all in the same
  change.
- Enforce it server-side. A screen with no buttons is good UX, not a guard.
- Test the negative too: assert live records are still writable. A guard that
  over-matches and freezes active data fails silently in exactly the way the
  positive test cannot see.

## 6. Verify against production, not against your assumptions

**What broke:** all of the above were found by a user, not by us.

- After deploying a fix, probe the real endpoint. `curl` the status codes; open
  the page. "The deploy is green" is not "the fix works".
- Before claiming something is live, check the deployed commit SHA matches
  `HEAD`.
- When reporting a result, say what you actually observed. If a probe could not
  reach the code path (e.g. an auth check fired first), say so rather than
  implying coverage.

---

## Before opening a PR

```bash
pnpm run check    # typecheck + lint + tests
```

CI runs the same three on every push and PR, plus the migration-journal
consistency check.

## Known gaps — not yet fixed

- **No error reporting.** Nothing collects runtime exceptions. Netlify function
  logs exist but nobody reads them. Until this is wired up, the user is the
  monitoring system.
- **No synthetic check on upstreams.** A retired model or a revoked key is
  invisible until someone tries to scan a receipt.
- **`hooks/use-table-data.ts` re-fetches unbounded.** `fetch_` depends on
  `data`, and the mount effect depends on `fetch_`, so every `setData` re-runs
  the effect and fires another fetch immediately.
