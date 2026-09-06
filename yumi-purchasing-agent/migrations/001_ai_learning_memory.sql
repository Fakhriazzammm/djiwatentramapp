-- ═══════════════════════════════════════════════════════════════
-- Migration 001: AI Learning Memory Tables
-- 
-- Untuk migrasi dari local JSON ke Supabase (opsional).
-- Jalankan ketika sudah siap pindah dari file-based learning memory.
--
-- Cara pakai:
--   psql "$SUPABASE_DB_URL" -f 001_ai_learning_memory.sql
--
--   (self-hosted: jalankan via psql di container supabase-db)

--     -H "Authorization: Bearer $ACCESS_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d '{"query": "..."}'
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── pos_ai_learning_memory ─────────────────────────────────────
-- Stores marketlist ingredient matching history for AI learning.
-- Each entry records what the AI matched, what the user confirmed,
-- and how often the match was reused.

CREATE TABLE IF NOT EXISTS pos_ai_learning_memory (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_input          TEXT NOT NULL,                       -- original user text (e.g. "kentang (abis bgt)")
    parsed_name         TEXT,                                -- normalized name from AI
    matched_inventory_id TEXT REFERENCES pos_inventory(_id) ON DELETE SET NULL,
    suggested_supplier_id TEXT REFERENCES pos_inventory_stores(_id) ON DELETE SET NULL,
    suggested_qty       FLOAT DEFAULT 0,
    suggested_unit      TEXT DEFAULT '',
    suggested_price     FLOAT DEFAULT 0,
    confidence          FLOAT DEFAULT 0.0,                   -- 0.0 - 1.0
    is_confirmed        BOOLEAN DEFAULT FALSE,               -- user clicked ✅ Confirm
    correction_type     TEXT,                                -- 'edit', 'reject', 'remap'
    correction_payload  JSONB,                               -- {new_name, new_supplier_id, ...}
    usage_count         INTEGER DEFAULT 1,                   -- how many times reused from cache
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index: full-text search on user input
CREATE INDEX IF NOT EXISTS idx_ai_learning_user_input
    ON pos_ai_learning_memory
    USING gin(to_tsvector('simple', user_input));

-- Index: confidence-based queries (highest confidence first)
CREATE INDEX IF NOT EXISTS idx_ai_learning_confidence
    ON pos_ai_learning_memory (confidence DESC);

-- Index: lookup by inventory ID
CREATE INDEX IF NOT EXISTS idx_ai_learning_inv_id
    ON pos_ai_learning_memory (matched_inventory_id);

-- Index: lookup by supplier
CREATE INDEX IF NOT EXISTS idx_ai_learning_supplier
    ON pos_ai_learning_memory (suggested_supplier_id);

-- Trigger: auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_ai_learning_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_learning_updated_at ON pos_ai_learning_memory;
CREATE TRIGGER trg_ai_learning_updated_at
    BEFORE UPDATE ON pos_ai_learning_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_learning_updated_at();

-- ── pos_ai_learning_stats ──────────────────────────────────────
-- Daily aggregation for dashboard BI — tracks learning effectiveness.

CREATE TABLE IF NOT EXISTS pos_ai_learning_stats (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date                DATE NOT NULL DEFAULT CURRENT_DATE,
    total_processed     INTEGER DEFAULT 0,                  -- total marketlist items processed
    ai_matched          INTEGER DEFAULT 0,                  -- matched via AI (new items)
    memory_hit          INTEGER DEFAULT 0,                  -- matched via learning memory (cache hit)
    user_corrected      INTEGER DEFAULT 0,                  -- user sent correction
    avg_confidence      FLOAT DEFAULT 0.0,                  -- rata-rata confidence hari itu
    processing_time_ms  INTEGER DEFAULT 0,                  -- avg processing time in ms
    UNIQUE(date)
);

-- Index: date-based stats queries
CREATE INDEX IF NOT EXISTS idx_ai_learning_stats_date
    ON pos_ai_learning_stats (date DESC);

-- ── RLS Policies ───────────────────────────────────────────────

ALTER TABLE pos_ai_learning_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_ai_learning_stats ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated access (these are learning data, not financial)
CREATE POLICY "Allow all authenticated read learning_memory"
    ON pos_ai_learning_memory FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all authenticated insert learning_memory"
    ON pos_ai_learning_memory FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all authenticated update learning_memory"
    ON pos_ai_learning_memory FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all authenticated read learning_stats"
    ON pos_ai_learning_stats FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all authenticated insert learning_stats"
    ON pos_ai_learning_stats FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow all authenticated update learning_stats"
    ON pos_ai_learning_stats FOR UPDATE
    USING (auth.role() = 'authenticated');

COMMIT;
