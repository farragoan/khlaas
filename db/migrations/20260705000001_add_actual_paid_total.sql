-- migrate:up
ALTER TABLE "split_tables" ADD COLUMN "actual_paid_total" numeric(10, 2);

-- migrate:down
ALTER TABLE "split_tables" DROP COLUMN "actual_paid_total";
