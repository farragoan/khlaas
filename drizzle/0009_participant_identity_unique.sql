-- One Clerk user gets one participant row per table.
--
-- The auto-join effect in app/t/[shareCode]/page.tsx fires whenever a signed-in
-- user has no localStorage session for a table, and POST /api/participants had
-- no uniqueness guard behind it. Clearing site data, switching browsers, or
-- Safari evicting the key therefore minted a second row for the same person and
-- split their selections across two identities. Audit at time of writing:
-- 9 duplicated (table_id, user_id) pairs over 20 rows, 3 of which had
-- selections landing on both sides — a silently wrong ledger.
--
-- Duplicates are collapsed onto the earliest row rather than deleted outright so
-- the surviving row keeps its claims. Dependents are repointed first:
-- ledger_entries has no ON DELETE clause, so deleting a referenced participant
-- would abort this migration on a foreign key violation.

-- selections: move to the keeper unless the keeper already claimed that item.
-- Leftovers are duplicate claims on the same item and cascade away below.
UPDATE "selections" s
SET "participant_id" = d."keeper_id"
FROM (
  SELECT id, FIRST_VALUE(id) OVER w AS keeper_id
  FROM (
    SELECT id, table_id, user_id, joined_at,
           ROW_NUMBER() OVER (PARTITION BY table_id, user_id ORDER BY joined_at ASC, id ASC) AS rn
    FROM "participants" WHERE "user_id" IS NOT NULL
  ) r
  WINDOW w AS (PARTITION BY table_id, user_id ORDER BY joined_at ASC, id ASC)
) d
WHERE s."participant_id" = d."id"
  AND d."id" <> d."keeper_id"
  AND NOT EXISTS (
    SELECT 1 FROM "selections" k
    WHERE k."participant_id" = d."keeper_id" AND k."item_id" = s."item_id"
  );
--> statement-breakpoint

-- payments: same shape, guarded by the (table_id, participant_id) unique index.
UPDATE "payments" p
SET "participant_id" = d."keeper_id"
FROM (
  SELECT id, FIRST_VALUE(id) OVER w AS keeper_id
  FROM (
    SELECT id, table_id, user_id, joined_at
    FROM "participants" WHERE "user_id" IS NOT NULL
  ) r
  WINDOW w AS (PARTITION BY table_id, user_id ORDER BY joined_at ASC, id ASC)
) d
WHERE p."participant_id" = d."id"
  AND d."id" <> d."keeper_id"
  AND NOT EXISTS (
    SELECT 1 FROM "payments" k
    WHERE k."table_id" = p."table_id" AND k."participant_id" = d."keeper_id"
  );
--> statement-breakpoint

-- ledger_entries: no ON DELETE, so these must be repointed, not orphaned.
UPDATE "ledger_entries" l
SET "from_participant" = d."keeper_id"
FROM (
  SELECT id, FIRST_VALUE(id) OVER w AS keeper_id
  FROM (SELECT id, table_id, user_id, joined_at FROM "participants" WHERE "user_id" IS NOT NULL) r
  WINDOW w AS (PARTITION BY table_id, user_id ORDER BY joined_at ASC, id ASC)
) d
WHERE l."from_participant" = d."id" AND d."id" <> d."keeper_id";
--> statement-breakpoint

UPDATE "ledger_entries" l
SET "to_participant" = d."keeper_id"
FROM (
  SELECT id, FIRST_VALUE(id) OVER w AS keeper_id
  FROM (SELECT id, table_id, user_id, joined_at FROM "participants" WHERE "user_id" IS NOT NULL) r
  WINDOW w AS (PARTITION BY table_id, user_id ORDER BY joined_at ASC, id ASC)
) d
WHERE l."to_participant" = d."id" AND d."id" <> d."keeper_id";
--> statement-breakpoint

-- Repointing can collapse a debt onto a single person; that entry is meaningless.
DELETE FROM "ledger_entries" WHERE "from_participant" = "to_participant";
--> statement-breakpoint

-- Remaining selections/payments on the losing rows cascade with the delete.
DELETE FROM "participants" p
USING (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY table_id, user_id ORDER BY joined_at ASC, id ASC) AS rn
    FROM "participants" WHERE "user_id" IS NOT NULL
  ) r WHERE r.rn > 1
) losers
WHERE p."id" = losers."id";
--> statement-breakpoint

-- Partial: guest rows carry user_id IS NULL and must stay unconstrained, since
-- NULL never equals NULL and an unfiltered index would still admit them anyway.
CREATE UNIQUE INDEX IF NOT EXISTS "participants_table_user_unique"
  ON "participants" ("table_id","user_id")
  WHERE "user_id" IS NOT NULL;
