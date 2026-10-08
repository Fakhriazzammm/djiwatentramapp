-- Expense-driven inventory foundation.
-- Additive only: preserves legacy inventory_transactions/products.quantity.

CREATE TABLE IF NOT EXISTS pos.expense_inventory_links (
  source_id text PRIMARY KEY,
  financial_transaction_source_id text NOT NULL,
  expense_item_key text NOT NULL,
  inventory_source_id text,
  raw_name text NOT NULL,
  quantity numeric(18,6),
  unit text,
  price numeric(18,2),
  line_total numeric(18,2),
  base_quantity numeric(18,6),
  base_unit text,
  match_method text NOT NULL DEFAULT 'pending',
  confidence numeric(5,2),
  status text NOT NULL DEFAULT 'pending',
  reviewed_by text,
  reviewed_at double precision,
  applied_movement_source_id text,
  idempotency_key text NOT NULL UNIQUE,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  creation_time double precision NOT NULL DEFAULT extract(epoch from now()) * 1000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (financial_transaction_source_id, expense_item_key)
);

CREATE INDEX IF NOT EXISTS idx_expense_inventory_links_status
  ON pos.expense_inventory_links (status, creation_time DESC);
CREATE INDEX IF NOT EXISTS idx_expense_inventory_links_inventory
  ON pos.expense_inventory_links (inventory_source_id);

CREATE TABLE IF NOT EXISTS pos.product_stock_policies (
  source_id text PRIMARY KEY,
  product_source_id text NOT NULL UNIQUE,
  stock_mode text NOT NULL DEFAULT 'counted',
  sell_unit text NOT NULL DEFAULT 'porsi',
  low_stock_threshold numeric(18,4) NOT NULL DEFAULT 0,
  allow_negative boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos.product_stock_movements (
  source_id text PRIMARY KEY,
  product_source_id text NOT NULL,
  movement_type text NOT NULL,
  quantity numeric(18,6) NOT NULL,
  before_quantity numeric(18,6) NOT NULL,
  after_quantity numeric(18,6) NOT NULL,
  source_type text NOT NULL,
  source_reference_id text,
  idempotency_key text NOT NULL UNIQUE,
  actor_id text,
  notes text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  creation_time double precision NOT NULL DEFAULT extract(epoch from now()) * 1000
);

CREATE INDEX IF NOT EXISTS idx_product_stock_movements_product
  ON pos.product_stock_movements (product_source_id, creation_time DESC);

CREATE TABLE IF NOT EXISTS pos.expense_receipt_documents (
  source_id text PRIMARY KEY,
  financial_transaction_source_id text NOT NULL UNIQUE,
  storage_path text,
  receipt_image_url text,
  file_hash text,
  merchant_name text,
  receipt_date double precision,
  receipt_total numeric(18,2),
  currency text NOT NULL DEFAULT 'IDR',
  ocr_status text NOT NULL DEFAULT 'pending',
  ocr_provider text,
  ocr_model text,
  ocr_version text,
  ocr_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  redacted_preview_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos.expense_receipt_items (
  source_id text PRIMARY KEY,
  receipt_source_id text NOT NULL REFERENCES pos.expense_receipt_documents(source_id),
  item_index integer NOT NULL,
  raw_name text NOT NULL,
  normalized_name text,
  quantity numeric(18,6),
  unit text,
  unit_price numeric(18,2),
  line_total numeric(18,2),
  inventory_link_id text,
  parse_confidence numeric(5,2),
  review_status text NOT NULL DEFAULT 'parsed',
  correction_reason text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (receipt_source_id, item_index)
);

CREATE OR REPLACE FUNCTION pos.apply_expense_inventory_link(
  p_link_id text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  link_row pos.expense_inventory_links%ROWTYPE;
  inv_row pos.inventory%ROWTYPE;
  delta numeric;
  before_qty numeric;
  after_qty numeric;
  movement_id text;
  tx_id text;
BEGIN
  SELECT * INTO link_row
  FROM pos.expense_inventory_links
  WHERE source_id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense inventory link not found: %', p_link_id;
  END IF;

  IF link_row.status = 'applied' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_applied',
      'movement_id', link_row.applied_movement_source_id
    );
  END IF;

  IF link_row.status <> 'approved' THEN
    RAISE EXCEPTION 'expense inventory link is not approved: %', link_row.status;
  END IF;

  IF link_row.inventory_source_id IS NULL THEN
    RAISE EXCEPTION 'inventory source is required';
  END IF;

  IF link_row.base_quantity IS NULL AND link_row.quantity IS NULL THEN
    RAISE EXCEPTION 'quantity is required';
  END IF;

  SELECT * INTO inv_row
  FROM pos.inventory
  WHERE source_id = link_row.inventory_source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory item not found: %', link_row.inventory_source_id;
  END IF;

  delta := COALESCE(link_row.base_quantity, link_row.quantity);
  before_qty := COALESCE(inv_row.quantity, 0);
  after_qty := before_qty + delta;
  movement_id := 'im_' || md5(p_idempotency_key);
  tx_id := 'it_' || md5(p_idempotency_key);

  INSERT INTO pos.inventory_movements (
    source_id, inventory_source_id, movement_type, direction,
    quantity_base, unit_base, before_quantity, after_quantity,
    cost_per_base_unit, source_type, source_reference_id, actor_id,
    notes, raw, creation_time
  ) VALUES (
    movement_id, inv_row.source_id, 'purchase', 'in', delta,
    COALESCE(link_row.base_unit, inv_row.base_unit, inv_row.unit),
    before_qty, after_qty,
    CASE WHEN delta <> 0 THEN COALESCE(link_row.line_total, link_row.price) / NULLIF(delta, 0) END,
    'expense', link_row.financial_transaction_source_id, link_row.reviewed_by,
    'Expense inventory restock', jsonb_build_object('link_id', link_row.source_id),
    extract(epoch from now()) * 1000
  ) ON CONFLICT (source_id) DO NOTHING;

  INSERT INTO pos.inventory_transactions (
    source_id, inventory_source_id, quantity, tx_type,
    cost_per_unit, remaining_quantity, tx_timestamp,
    purchase_unit, purchase_quantity, line_total,
    source_transaction_id, source_label, source_fingerprint,
    creation_time, raw
  ) VALUES (
    tx_id, inv_row.source_id, delta, 'restock',
    CASE WHEN delta <> 0 THEN COALESCE(link_row.line_total, link_row.price) / NULLIF(delta, 0) END,
    after_qty, extract(epoch from now()) * 1000,
    link_row.unit, link_row.quantity, link_row.line_total,
    link_row.financial_transaction_source_id, 'expense_inventory_link', p_idempotency_key,
    extract(epoch from now()) * 1000, jsonb_build_object('link_id', link_row.source_id)
  ) ON CONFLICT (source_id) DO NOTHING;

  UPDATE pos.inventory
  SET quantity = after_qty,
      last_purchase_price = COALESCE(link_row.line_total, link_row.price, last_purchase_price),
      last_purchase_at = extract(epoch from now()) * 1000
  WHERE source_id = inv_row.source_id;

  UPDATE pos.expense_inventory_links
  SET status = 'applied',
      applied_movement_source_id = movement_id,
      updated_at = now()
  WHERE source_id = link_row.source_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'applied',
    'movement_id', movement_id,
    'inventory_id', inv_row.source_id,
    'before_quantity', before_qty,
    'after_quantity', after_qty
  );
END;
$$;

CREATE OR REPLACE FUNCTION pos.post_product_stock_movement(
  p_product_source_id text,
  p_movement_type text,
  p_quantity numeric,
  p_source_type text,
  p_source_reference_id text,
  p_idempotency_key text,
  p_actor_id text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  product_row pos.products%ROWTYPE;
  policy_row pos.product_stock_policies%ROWTYPE;
  before_qty numeric;
  after_qty numeric;
  movement_id text;
BEGIN
  SELECT * INTO product_row FROM pos.products
  WHERE source_id = p_product_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product not found: %', p_product_source_id; END IF;

  SELECT * INTO policy_row FROM pos.product_stock_policies
  WHERE product_source_id = p_product_source_id;

  IF EXISTS (SELECT 1 FROM pos.product_stock_movements WHERE idempotency_key = p_idempotency_key) THEN
    RETURN jsonb_build_object('success', true, 'status', 'already_applied');
  END IF;

  before_qty := COALESCE(product_row.quantity, 0);
  after_qty := before_qty + p_quantity;
  IF after_qty < 0 AND COALESCE(policy_row.allow_negative, false) = false THEN
    RAISE EXCEPTION 'product stock would become negative';
  END IF;

  movement_id := 'psm_' || md5(p_idempotency_key);
  INSERT INTO pos.product_stock_movements (
    source_id, product_source_id, movement_type, quantity,
    before_quantity, after_quantity, source_type, source_reference_id,
    idempotency_key, actor_id, notes, raw, creation_time
  ) VALUES (
    movement_id, p_product_source_id, p_movement_type, p_quantity,
    before_qty, after_qty, p_source_type, p_source_reference_id,
    p_idempotency_key, p_actor_id, p_notes, '{}'::jsonb,
    extract(epoch from now()) * 1000
  );

  UPDATE pos.products SET quantity = after_qty WHERE source_id = p_product_source_id;

  RETURN jsonb_build_object(
    'success', true, 'status', 'applied', 'movement_id', movement_id,
    'before_quantity', before_qty, 'after_quantity', after_qty
  );
END;
$$;

CREATE OR REPLACE VIEW public.pos_product_stock AS
SELECT
  p.source_id AS "_id",
  p.source_id AS "productId",
  p.name,
  p.quantity,
  p.is_available AS "isAvailable",
  COALESCE(sp.stock_mode, 'counted') AS "stockMode",
  COALESCE(sp.sell_unit, 'porsi') AS "sellUnit",
  COALESCE(sp.low_stock_threshold, 0) AS "lowStockThreshold",
  COALESCE(sp.allow_negative, false) AS "allowNegative"
FROM pos.products p
LEFT JOIN pos.product_stock_policies sp ON sp.product_source_id = p.source_id;

CREATE OR REPLACE VIEW public.pos_expense_inventory_links AS
SELECT
  source_id AS "_id",
  financial_transaction_source_id AS "transactionId",
  expense_item_key AS "expenseItemKey",
  inventory_source_id AS "inventoryId",
  raw_name AS "rawName",
  quantity,
  unit,
  price,
  line_total AS "lineTotal",
  base_quantity AS "baseQuantity",
  base_unit AS "baseUnit",
  match_method AS "matchMethod",
  confidence,
  status,
  reviewed_by AS "reviewedBy",
  reviewed_at AS "reviewedAt",
  applied_movement_source_id AS "appliedMovementId",
  creation_time AS "creationTime",
  updated_at AS "updatedAt",
  raw
FROM pos.expense_inventory_links;

CREATE OR REPLACE VIEW public.pos_expense_receipt_documents AS
SELECT
  source_id AS "_id",
  financial_transaction_source_id AS "transactionId",
  storage_path AS "storagePath",
  receipt_image_url AS "receiptImageUrl",
  file_hash AS "fileHash",
  merchant_name AS "merchantName",
  receipt_date AS "receiptDate",
  receipt_total AS "receiptTotal",
  currency,
  ocr_status AS "ocrStatus",
  ocr_provider AS "ocrProvider",
  ocr_model AS "ocrModel",
  ocr_version AS "ocrVersion",
  redacted_preview_path AS "redactedPreviewPath",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
FROM pos.expense_receipt_documents;

CREATE OR REPLACE VIEW public.pos_expense_receipt_items AS
SELECT
  source_id AS "_id",
  receipt_source_id AS "receiptId",
  item_index AS "itemIndex",
  raw_name AS "rawName",
  normalized_name AS "normalizedName",
  quantity,
  unit,
  unit_price AS "unitPrice",
  line_total AS "lineTotal",
  inventory_link_id AS "inventoryLinkId",
  parse_confidence AS "parseConfidence",
  review_status AS "reviewStatus",
  correction_reason AS "correctionReason",
  raw
FROM pos.expense_receipt_items;

GRANT SELECT ON public.pos_product_stock TO anon, authenticated;
GRANT SELECT ON public.pos_expense_inventory_links TO anon, authenticated;
GRANT SELECT ON public.pos_expense_receipt_documents TO anon, authenticated;
GRANT SELECT ON public.pos_expense_receipt_items TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.apply_expense_inventory_link(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pos.post_product_stock_movement(text, text, numeric, text, text, text, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
