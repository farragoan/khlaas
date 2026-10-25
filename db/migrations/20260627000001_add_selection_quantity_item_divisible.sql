-- migrate:up
ALTER TABLE "selections" ADD COLUMN "quantity" integer NOT NULL DEFAULT 1;

ALTER TABLE "items" ADD COLUMN "divisible" boolean NOT NULL DEFAULT true;

-- migrate:down
ALTER TABLE "items" DROP COLUMN "divisible";
ALTER TABLE "selections" DROP COLUMN "quantity";
