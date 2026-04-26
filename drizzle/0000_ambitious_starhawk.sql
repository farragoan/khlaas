CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total_price" numeric(10, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
	"sort_order" integer,
	"is_fee" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"from_participant" uuid NOT NULL,
	"to_participant" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"user_id" text,
	"session_token" text,
	"joined_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "split_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"receipt_url" text,
	"raw_ocr" text,
	"tip" numeric(10, 2) DEFAULT '0',
	"currency" text DEFAULT 'INR' NOT NULL,
	CONSTRAINT "split_tables_share_code_unique" UNIQUE("share_code"),
	CONSTRAINT "status_check" CHECK ("split_tables"."status" IN ('active', 'items_ready', 'editing', 'settled', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_table_id_split_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."split_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_table_id_split_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."split_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_from_participant_participants_id_fk" FOREIGN KEY ("from_participant") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_to_participant_participants_id_fk" FOREIGN KEY ("to_participant") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_table_id_split_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."split_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_table_id_split_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."split_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_items_table_id" ON "items" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_table" ON "ledger_entries" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_from" ON "ledger_entries" USING btree ("from_participant");--> statement-breakpoint
CREATE INDEX "idx_participants_table_id" ON "participants" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_table_participant_unique" ON "payments" USING btree ("table_id","participant_id");--> statement-breakpoint
CREATE INDEX "idx_payments_table" ON "payments" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "selections_participant_item_unique" ON "selections" USING btree ("participant_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_selections_participant" ON "selections" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "idx_selections_item" ON "selections" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_split_tables_share_code" ON "split_tables" USING btree ("share_code");