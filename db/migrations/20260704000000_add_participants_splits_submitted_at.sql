-- migrate:up
ALTER TABLE participants ADD COLUMN splits_submitted_at timestamp with time zone;
-- migrate:down
ALTER TABLE participants DROP COLUMN splits_submitted_at;
