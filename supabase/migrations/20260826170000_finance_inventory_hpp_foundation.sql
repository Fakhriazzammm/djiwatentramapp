-- Finance / Inventory / HPP foundation.
-- Additive only: preserves existing quantity, recipes, HPP snapshots, and history.
-- Rollback: disable new callers/feature flags; do not drop these tables or columns.

ALTER TABLE pos.inventory
  ADD COLUMN IF NOT EXISTS base_unit text,
  ADD COLUMN IF NOT EXISTS recipe_unit text,
  ADD COLUMN IF NOT EXISTS price_unit text,
  ADD COLUMN IF NOT EXISTS unit_status text NOT NULL DEFAULT 'AMBIGUOUS',
  ADD COLUMN IF NOT EXISTS conversion_source text;

ALTER TABLE pos.financial_transactions
  ADD COLUMN IF NOT EXISTS transaction_kind text,
  ADD COLUMN IF NOT EXISTS is_cash_outflow boolean,
  ADD COLUMN IF NOT EXISTS cogs_order_source_id text;

ALTER TABLE pos.stock_opname_logs
  ADD COLUMN IF NOT EXISTS system_base_quantity numeric(18,4),
  ADD COLUMN IF NOT EXISTS counted_base_quantity numeric(18,4),
  ADD COLUMN IF NOT EXISTS variance_base_quantity numeric(18,4),
  ADD COLUMN IF NOT EXISTS finalized_by text,
  ADD COLUMN IF NOT EXISTS finalized_at double precision;

CREATE TABLE IF NOT EXISTS pos.inventory_packaging_levels (
  source_id text PRIMARY KEY,
  inventory_source_id text NOT NULL REFERENCES pos.inventory(source_id) ON DELETE RESTRICT,
  level_key text NOT NULL,
  label text NOT NULL,
  unit text NOT NULL,
  quantity_in_base numeric(18,6) NOT NULL CHECK (quantity_in_base > 0),
  parent_level_source_id text REFERENCES pos.inventory_packaging_levels(source_id) ON DELETE RESTRICT,
  units_per_parent numeric(18,6),
  is_purchase_unit boolean NOT NULL DEFAULT false,
  is_operational_unit boolean NOT NULL DEFAULT false,
  is_recipe_unit boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  creation_time double precision NOT NULL DEFAULT (extract(epoch FROM now()) * 1000),
  CONSTRAINT inventory_packaging_level_key_unique UNIQUE (inventory_source_id, level_key),
  CONSTRAINT inventory_packaging_label_unique UNIQUE (inventory_source_id, label),
  CONSTRAINT inventory_packaging_parent_units_check CHECK (
    units_per_parent IS NULL OR units_per_parent > 0
  )
);

CREATE INDEX IF NOT EXISTS inventory_packaging_inventory_idx
  ON pos.inventory_packaging_levels (inventory_source_id, is_active);

CREATE INDEX IF NOT EXISTS inventory_packaging_purchase_idx
  ON pos.inventory_packaging_levels (inventory_source_id, is_purchase_unit)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS inventory_packaging_operational_idx
  ON pos.inventory_packaging_levels (inventory_source_id, is_operational_unit)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS pos.inventory_movements (
  source_id text PRIMARY KEY,
  inventory_source_id text NOT NULL REFERENCES pos.inventory(source_id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('purchase','sale_usage','stock_opname','waste','adjustment')),
  direction text NOT NULL CHECK (direction IN ('in','out','set')),
  quantity_base numeric(18,6) NOT NULL CHECK (quantity_base >= 0),
  unit_base text NOT NULL,
  before_quantity numeric(18,6),
  after_quantity numeric(18,6),
  cost_per_base_unit numeric(18,6),
  source_type text,
  source_reference_id text,
  actor_id text,
  notes text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  creation_time double precision NOT NULL DEFAULT (extract(epoch FROM now()) * 1000),
  CONSTRAINT inventory_movement_source_unique UNIQUE (source_type, source_reference_id, inventory_source_id, movement_type)
);

CREATE INDEX IF NOT EXISTS inventory_movements_inventory_time_idx
  ON pos.inventory_movements (inventory_source_id, creation_time DESC);

CREATE INDEX IF NOT EXISTS inventory_movements_source_idx
  ON pos.inventory_movements (source_type, source_reference_id);

ALTER TABLE pos.inventory_packaging_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_packaging_service_role_all ON pos.inventory_packaging_levels;
CREATE POLICY inventory_packaging_service_role_all
  ON pos.inventory_packaging_levels FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS inventory_movements_service_role_all ON pos.inventory_movements;
CREATE POLICY inventory_movements_service_role_all
  ON pos.inventory_movements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON pos.inventory_packaging_levels TO service_role;
GRANT ALL ON pos.inventory_movements TO service_role;

COMMENT ON TABLE pos.inventory_packaging_levels IS
  'Packaging hierarchy per inventory item; quantity_in_base is authoritative conversion to the item base unit.';
COMMENT ON TABLE pos.inventory_movements IS
  'Auditable inventory ledger in base units. One source event must be idempotent.';
COMMENT ON COLUMN pos.inventory.unit_status IS
  'Unit normalization status: READY, NEEDS_WEIGHT, NEEDS_SUPPLIER_CONFIRMATION, AMBIGUOUS, NOT_USED_IN_RECIPE.';
COMMENT ON COLUMN pos.financial_transactions.transaction_kind IS
  'purchase, operating_expense, order_cogs, payroll, or adjustment.';
COMMENT ON COLUMN pos.financial_transactions.is_cash_outflow IS
  'True only when the transaction represents actual cash leaving the business.';
