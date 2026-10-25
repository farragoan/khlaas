-- migrate:up
ALTER TABLE "split_tables" ADD COLUMN "created_by" text;
-- migrate:down
ALTER TABLE "split_tables" DROP COLUMN "created_by";
