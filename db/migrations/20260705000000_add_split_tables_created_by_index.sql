-- migrate:up
CREATE INDEX "idx_split_tables_created_by" ON "split_tables" USING btree ("created_by");
-- migrate:down
DROP INDEX "idx_split_tables_created_by";
