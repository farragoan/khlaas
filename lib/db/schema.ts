import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const splitTables = pgTable(
  "split_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareCode: text("share_code").unique().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status")
      .notNull()
      .default("active")
      .$type<"active" | "items_ready" | "editing" | "settled" | "expired">(),
    receiptUrl: text("receipt_url"),
    rawOcr: text("raw_ocr"), // JSONB stored as text for simplicity
    tip: numeric("tip", { precision: 10, scale: 2 }).default("0"),
    currency: text("currency").notNull().default("INR"),
    createdBy: text("created_by"), // Clerk userId of the table creator
    paymentMode: text("payment_mode").$type<"host" | "split">(),
  },
  (t) => [
    uniqueIndex("idx_split_tables_share_code").on(t.shareCode),
    check(
      "status_check",
      sql`${t.status} IN ('active', 'items_ready', 'editing', 'settled', 'expired')`
    ),
  ]
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => splitTables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 })
      .notNull(),
    quantity: integer("quantity").notNull().default(1),
    totalPrice: numeric("total_price", { precision: 10, scale: 2 }).generatedAlwaysAs(
      sql`unit_price * quantity`
    ),
    sortOrder: integer("sort_order"),
    isFee: boolean("is_fee").notNull().default(false),
    divisible: boolean("divisible").notNull().default(true),
  },
  (t) => [index("idx_items_table_id").on(t.tableId)]
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => splitTables.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    userId: text("user_id"), // Clerk userId string (user_xxx...) or null for guests
    sessionToken: text("session_token"),
    upiId: text("upi_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_participants_table_id").on(t.tableId)]
);

export const selections = pgTable(
  "selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("selections_participant_item_unique").on(
      t.participantId,
      t.itemId
    ),
    index("idx_selections_participant").on(t.participantId),
    index("idx_selections_item").on(t.itemId),
  ]
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => splitTables.id),
    fromParticipant: uuid("from_participant")
      .notNull()
      .references(() => participants.id),
    toParticipant: uuid("to_participant")
      .notNull()
      .references(() => participants.id),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    settled: boolean("settled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_ledger_table").on(t.tableId),
    index("idx_ledger_from").on(t.fromParticipant),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => splitTables.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_table_participant_unique").on(t.tableId, t.participantId),
    index("idx_payments_table").on(t.tableId),
  ]
);

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").unique().notNull(),
  displayName: text("display_name"),
  upiId: text("upi_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type SplitTable = typeof splitTables.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Selection = typeof selections.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
