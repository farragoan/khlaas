-- migrate:up
ALTER TABLE "participants" ADD COLUMN "upi_id" text;

-- migrate:down
ALTER TABLE "participants" DROP COLUMN "upi_id";
