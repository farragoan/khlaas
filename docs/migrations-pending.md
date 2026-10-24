# Pending migrations

SQL the app does NOT require to run, but which closes races the app-level
guards can only narrow. Generate through `drizzle-kit generate` when applying
(ENGINEERING.md rule 3); do not hand-drop these into `drizzle/`.

## ledger_entries: one transfer per pair per table

Settle is made idempotent in `app/api/ledger/compute/route.ts` with a
conditional status update. This index makes a duplicate set physically
impossible. Delete any existing duplicates first.

```sql
CREATE UNIQUE INDEX ledger_entries_table_pair_unique
  ON ledger_entries (table_id, from_participant, to_participant);
```

## selections: never allocate more units than an item has

`app/api/selections/route.ts` checks capacity in one statement and re-checks
after writing, but neon-http has no transactions, so only a trigger is airtight.

```sql
CREATE OR REPLACE FUNCTION enforce_selection_capacity() RETURNS trigger AS $$
DECLARE cap integer; used integer;
BEGIN
  SELECT quantity INTO cap FROM items WHERE id = NEW.item_id FOR UPDATE;
  SELECT coalesce(sum(quantity), 0) INTO used FROM selections
    WHERE item_id = NEW.item_id AND id <> NEW.id;
  IF used + NEW.quantity > cap THEN
    RAISE EXCEPTION 'item % over-allocated', NEW.item_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER selections_capacity
  BEFORE INSERT OR UPDATE OF quantity ON selections
  FOR EACH ROW EXECUTE FUNCTION enforce_selection_capacity();
```

## split_tables: explicit host (optional)

The host is now the participant whose `user_id` equals `split_tables.created_by`
(no migration needed). Only worth adding if hosts ever stop being signed-in
creators.
