# Database migrations (dbmate)

Migrations are plain SQL in `db/migrations/`, run by [dbmate](https://github.com/amacneil/dbmate)
(pinned to 2.37.0 as the `dbmate` devDependency). `db/schema.sql` is the schema dump
after all migrations; commit it with every migration.

```bash
export DATABASE_URL=...        # read by name only; never commit a value
pnpm db:status                 # applied / pending
pnpm db:up                     # apply pending, then re-dump db/schema.sql
pnpm db:down                   # roll back ONE migration
pnpm db:new add_something      # new timestamped file
pnpm db:check                  # lint + up/down/up on a LOCALHOST scratch DB only
```

`db:up` dumps `db/schema.sql` with `pg_dump`, which must be on PATH. Dump from a
scratch database (not production) so the committed file is deterministic; use
major version 16 to match CI. Set `DBMATE_NO_DUMP_SCHEMA=true` to skip the dump.

Each file has `-- migrate:up` and `-- migrate:down`; each runs in one transaction.
`lib/db/schema.ts` (drizzle) is the query layer only and is edited by hand to match.
Also add the new version to `lib/health/migration-versions.ts` (CI enforces it).

## Conversion from drizzle-kit

The ten files in `drizzle/` were converted one-to-one, in journal order, to
`db/migrations/` (the old `drizzle/` directory and `drizzle-kit` were removed;
history is in git). `docs/migrations-pending.md` was named in the brief but does
not exist in this repository; the only pending-migration note was
`docs/user-actions.md` item 1 (the `editing` status), which turned out to be in
the initial schema already.

| dbmate version | was | Production status (inferred, NOT verified against any database) |
|---|---|---|
| 20260426000000_initial_schema | 0000 | Applied. Predates the CI workflow (2026-06-23) so applied by hand or `push`; certain in practice, since the app runs. |
| 20260502000000_add_participants_upi_id | 0001 | Applied (same reasoning; UPI features shipped). |
| 20260623000000_add_split_tables_created_by | 0002 | Applied (shipped with migrate workflow, `created_by` used by history). |
| 20260627000000_add_user_profiles | 0003 | Applied, medium confidence. Was an unjournaled "live" file until commit 167dfbd (2026-07-05) registered it. |
| 20260627000001_add_selection_quantity_item_divisible | 0004 | Same as above. |
| 20260627000002_add_payment_mode | 0005 | Same as above. |
| 20260704000000_add_participants_splits_submitted_at | 0006 | Same as above. |
| 20260705000000_add_split_tables_created_by_index | 0007 | Applied (ROADMAP.md: "Migration registered and applied"). |
| 20260705000001_add_actual_paid_total | 0008 | Applied, medium confidence (renamed from 0003 in 167dfbd). |
| 20260818000000_participant_identity_unique | 0009 | UNCERTAIN. Merged 2026-08-18; the migrate workflow should have applied it, but check that index `participants_table_user_unique` exists. |

Nothing is pending that the repo knows of beyond what is uncertain above.
Verify before bootstrapping: `\d participants` (upi_id, splits_submitted_at, index
above), `\d split_tables` (created_by, payment_mode, actual_paid_total, status_check
with 'editing'), `\d items` (divisible), `\d selections` (quantity), `\d user_profiles`.

## Adopting dbmate on the existing production database (not yet done)

Production has the tables but no dbmate bookkeeping. Running `db:up` there would
try 0000 and fail (safely, in a transaction). Once the checks above pass, mark
the applied versions as done, once, by hand:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (version varchar PRIMARY KEY);
INSERT INTO schema_migrations (version) VALUES
 ('20260426000000'),('20260502000000'),('20260623000000'),('20260627000000'),
 ('20260627000001'),('20260627000002'),('20260704000000'),('20260705000000'),
 ('20260705000001');
-- add ('20260818000000') only if the participants_table_user_unique index exists;
-- otherwise leave it out and let db:up apply it.
```

Only after that does `.github/workflows/migrate.yml` (now `dbmate up`) become
safe on merge. The old `drizzle.__drizzle_migrations` table can stay or be dropped.

## Caveats

- `20260818000000_participant_identity_unique` down only drops the index; its
  dedupe (deletes/repoints rows) is irreversible.
- The initial migration down drops all app tables (data loss); scratch use only.
- The migrations were round-tripped on empty tables only. The 0009 dedupe was
  not exercised against duplicate data here.
