-- khlaas database schema
-- Target: Neon (serverless PostgreSQL)
-- Real-time sync: ElectricSQL (reads shape subscriptions from logical replication)
--
-- ElectricSQL requires: REPLICA IDENTITY FULL on all synced tables (set below)
-- Run against your Neon project via psql or the Neon SQL editor.

-- ============================================================
-- TABLES
-- ============================================================

-- A bill split session
CREATE TABLE split_tables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code  TEXT UNIQUE NOT NULL,        -- short URL slug: /t/abc123
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'items_ready', 'settled', 'expired')),
  receipt_url TEXT,                        -- Cloudflare R2 object key
  raw_ocr     JSONB                        -- cached OCR response (for debugging / re-parsing)
);

-- Line items extracted from receipt
CREATE TABLE items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    UUID NOT NULL REFERENCES split_tables(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_price NUMERIC(10,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  sort_order  INTEGER,
  is_fee      BOOLEAN NOT NULL DEFAULT FALSE  -- TRUE for tax, service charge, tip
);

-- Participants (V1: anonymous via session token; V2: linked to users table via Lucia Auth)
CREATE TABLE participants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id      UUID NOT NULL REFERENCES split_tables(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  user_id       UUID,                          -- NULL in V1; FK to users.id in V2
  session_token TEXT,                          -- client-generated ephemeral ID (V1 only)
  joined_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Who ate what (many-to-many: participant <-> item)
-- Non-exclusive: multiple participants can select the same item (cost split equally)
CREATE TABLE selections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_id, item_id)
);

-- Final ledger (computed when host settles the table)
CREATE TABLE ledger_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id         UUID NOT NULL REFERENCES split_tables(id),
  from_participant UUID NOT NULL REFERENCES participants(id),
  to_participant   UUID NOT NULL REFERENCES participants(id),
  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  settled          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- User accounts (V2 — created by Lucia Auth)
-- Included here so the schema is complete; NOT used in V1.
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Lucia Auth session table (V2)
CREATE TABLE user_sessions (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_items_table_id          ON items(table_id);
CREATE INDEX idx_participants_table_id   ON participants(table_id);
CREATE INDEX idx_selections_participant  ON selections(participant_id);
CREATE INDEX idx_selections_item         ON selections(item_id);
CREATE INDEX idx_ledger_table            ON ledger_entries(table_id);
CREATE INDEX idx_ledger_from             ON ledger_entries(from_participant);
CREATE INDEX idx_split_tables_share_code ON split_tables(share_code);

-- ============================================================
-- ELECTRICSQL REPLICA IDENTITY
-- ElectricSQL requires FULL replica identity to stream all column values.
-- ============================================================

ALTER TABLE split_tables   REPLICA IDENTITY FULL;
ALTER TABLE items           REPLICA IDENTITY FULL;
ALTER TABLE participants    REPLICA IDENTITY FULL;
ALTER TABLE selections      REPLICA IDENTITY FULL;
ALTER TABLE ledger_entries  REPLICA IDENTITY FULL;

-- ============================================================
-- ROW LEVEL SECURITY
-- V1: permissive — anyone with the share_code can read; writes validated at app layer.
-- V2: tighten using user_id once Lucia Auth is in place.
-- ============================================================

ALTER TABLE split_tables   ENABLE ROW LEVEL SECURITY;
ALTER TABLE items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE selections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries  ENABLE ROW LEVEL SECURITY;

-- V1: open read access (table is only discoverable via share_code which is not guessable)
CREATE POLICY "read split_tables"   ON split_tables   FOR SELECT USING (true);
CREATE POLICY "read items"          ON items           FOR SELECT USING (true);
CREATE POLICY "read participants"   ON participants    FOR SELECT USING (true);
CREATE POLICY "read selections"     ON selections      FOR SELECT USING (true);
CREATE POLICY "read ledger"         ON ledger_entries  FOR SELECT USING (true);

-- V1: writes allowed — session_token validation enforced in application layer
-- TODO V2: restrict to authenticated users with matching user_id
CREATE POLICY "insert split_tables"  ON split_tables  FOR INSERT WITH CHECK (true);
CREATE POLICY "insert participants"  ON participants  FOR INSERT WITH CHECK (true);
CREATE POLICY "insert selection"     ON selections    FOR INSERT WITH CHECK (true);
CREATE POLICY "delete own selection" ON selections    FOR DELETE USING (true);
CREATE POLICY "update split_tables"  ON split_tables  FOR UPDATE USING (true);
CREATE POLICY "insert items"         ON items         FOR INSERT WITH CHECK (true);
CREATE POLICY "insert ledger"        ON ledger_entries FOR INSERT WITH CHECK (true);
