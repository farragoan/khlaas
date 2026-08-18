<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Engineering rules

`docs/ENGINEERING.md` is not optional reading. Every rule in it exists because
the thing it forbids already shipped and already broke a real user's bill.

The six that get violated most:

1. **Never swallow an error.** A `catch` in an API route binds the error and
   `console.error`s it. `catch { }` with no body needs a comment saying why the
   failure is harmless.
2. **Verify external IDs against the live API before shipping them.** Model
   names, endpoints, env vars. Appearing in a `/models` listing is not proof it
   is callable.
3. **Never paper over a missing DB column with a fallback query.** Migrate, or
   fail loudly. Generate migrations with `drizzle-kit generate` — a hand-written
   `.sql` is not journalled and applies to nobody.
4. **Money math gets a test in both directions.** Dropping a real charge costs
   as much as keeping a fake one.
5. **A state guard on some write routes is not a lock.** Enumerate every route
   that writes to the table and guard them in the same change; test that live
   records are still writable.
6. **Verify against production after deploying.** Probe the endpoint, check the
   deployed SHA. "The deploy is green" is not "the fix works". Report what you
   actually observed, including which paths a probe could not reach.

Run `pnpm run check` (typecheck + lint + tests) before opening a PR. CI runs it
on every push.
