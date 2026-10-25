-- migrate:up
ALTER TABLE split_tables ADD COLUMN payment_mode text;

-- migrate:down
ALTER TABLE split_tables DROP COLUMN payment_mode;
