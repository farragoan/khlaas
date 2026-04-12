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
      .$type<"active" | "items_ready" | "settled" | "expired">(),
    receiptUrl: text("receipt_url"),
    rawOcr: text("raw_ocr"), // JSONB stored as text for simplicity
  },
  (t) => [
    uniqueIndex("idx_split_tables_share_code").on(t.shareCode),
    check(
      "status_check",
      sql`${t.status} IN ('active', 'items_ready', 'settled', 'expired')`
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
    userId: uuid("user_id"), // NULL in V1
    sessionToken: text("session_token"),
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

export type SplitTable = typeof splitTables.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Selection = typeof selections.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
