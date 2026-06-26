ALTER TABLE "selections" ADD COLUMN "quantity" integer NOT NULL DEFAULT 1;

ALTER TABLE "items" ADD COLUMN "divisible" boolean NOT NULL DEFAULT true;
