CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"display_name" text,
	"upi_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_profiles_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "divisible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "splits_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "selections" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "split_tables" ADD COLUMN "payment_mode" text;--> statement-breakpoint
ALTER TABLE "split_tables" ADD COLUMN "actual_paid_total" numeric(10, 2);