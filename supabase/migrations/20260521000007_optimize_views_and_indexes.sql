-- ============================================================================
-- Migration: Optimasi VIEW dan Index untuk Percepatan Query
-- 
-- Masalah:
--   1. pos_shift_reports VIEW → correlated subquery = 300+ subqueries/scan → 1.9s
--   2. pos_orders VIEW → correlated subquery di SELECT items
--   3. orders.order_type tidak punya index → sequential scan
--   4. shifts.start_time tidak punya index → sequential scan tiap query
--   5. orders.created_at + order_type — join ke shift butuh composite index
-- ============================================================================

-- ── Index Baru ──────────────────────────────────────────────────────────

-- 1. Composite index untuk join orders ke shift range
CREATE INDEX IF NOT EXISTS idx_pos_orders_created_at_order_type
  ON pos.orders (created_at, order_type)
  WHERE created_at IS NOT NULL;

-- 2. Index untuk filter orders berdasarkan order_type
CREATE INDEX IF NOT EXISTS idx_pos_orders_order_type
  ON pos.orders (order_type)
  WHERE order_type IS NOT NULL;

-- 3. Index untuk shifts start_time — sorting & filtering
CREATE INDEX IF NOT EXISTS idx_pos_shifts_start_time
  ON pos.shifts (start_time DESC);

-- 4. Index untuk orders.created_at + status — dashboard filter
CREATE INDEX IF NOT EXISTS idx_pos_orders_created_at_status
  ON pos.orders (created_at, status)
  WHERE created_at IS NOT NULL AND status IS NOT NULL;

-- 5. Index untuk COALESCE(created_at, creation_time)
CREATE INDEX IF NOT EXISTS idx_pos_orders_creation_coalesce
  ON pos.orders (COALESCE(created_at, creation_time))
  WHERE created_at IS NOT NULL OR creation_time IS NOT NULL;

-- 6. Index untuk financial_targets month
CREATE INDEX IF NOT EXISTS idx_financial_targets_month
  ON pos.financial_targets (month);

-- 7. Composite index untuk tx_type + tx_date (daily_income di shift_reports)
DROP INDEX IF EXISTS idx_pos_financial_transactions_tx_date;
DROP INDEX IF EXISTS idx_pos_financial_transactions_tx_type;
CREATE INDEX IF NOT EXISTS idx_ft_tx_type_tx_date
  ON pos.financial_transactions (tx_type, tx_date)
  WHERE tx_type IS NOT NULL;


-- ── Optimasi pos_shift_reports VIEW ──────────────────────────────────────
-- Ganti correlated subquery + nested sub-select dengan LEFT JOIN + GROUP BY
-- Estimasi: 1.945ms → < 50ms

DROP VIEW IF EXISTS public.pos_shift_reports CASCADE;

CREATE VIEW public.pos_shift_reports AS
WITH
shift_config AS (
  SELECT GREATEST(1, COALESCE(jsonb_array_length(
    (raw #> '{shiftSettings,predefinedShifts}'::text[])
  ), 2)) AS shifts_per_day
  FROM pos.site_settings
  ORDER BY creation_time DESC NULLS LAST
  LIMIT 1
),
base_shifts AS (
  SELECT
    s.source_id           AS shift_id,
    s.shift_name,
    s.cashier_name,
    COALESCE(s.team_members, '') AS team_members,
    s.start_time,
    s.end_time,
    CASE WHEN s.end_time IS NULL THEN 'AKTIF' ELSE 'SELESAI' END AS status,
    s.starting_cash,
    COALESCE((s.summary ->> 'cashRevenue')::numeric, 0)    AS cash_revenue,
    COALESCE((s.summary ->> 'qrisRevenue')::numeric, 0)    AS qris_revenue,
    0::numeric                                              AS other_revenue,
    COALESCE((s.summary ->> 'totalRevenue')::numeric, 0)   AS total_revenue,
    COALESCE((s.summary ->> 'totalDiscount')::numeric, 0)  AS total_discount,
    COALESCE((s.summary ->> 'totalExpenses')::numeric, 0)  AS total_expenses,
    COALESCE((s.summary ->> 'totalItemsSold')::numeric, 0) AS total_items_sold,
    to_char(to_timestamp(s.start_time / 1000.0), 'YYYY-MM') AS month_key,
    date_trunc('day', to_timestamp(s.start_time / 1000.0))  AS day_start_ts
  FROM pos.shifts s
),
-- LEFT JOIN + GROUP BY: 1 pass per shift, bukan 2 correlated subqueries
orders_per_shift AS (
  SELECT
    s.shift_id,
    COUNT(o.source_id)::int AS order_count,
    COUNT(o.source_id) FILTER (WHERE lower(COALESCE(o.order_type, '')) = 'booking')::int AS booking_count
  FROM base_shifts s
  LEFT JOIN pos.orders o
    ON COALESCE(o.created_at, o.creation_time) >= s.start_time
   AND COALESCE(o.created_at, o.creation_time) <= COALESCE(s.end_time, EXTRACT(EPOCH FROM now()) * 1000)
  GROUP BY s.shift_id
),
-- LEFT JOIN + GROUP BY: 1 pass per shift, bukan 1 correlated subquery
daily_income AS (
  SELECT
    s.shift_id,
    COALESCE(SUM(ft.amount) FILTER (
      WHERE COALESCE(ft.status, 'completed') = 'completed'
        AND COALESCE(ft.category, '') NOT IN ('Modal Awal', 'Setoran Akhir')
    ), 0)::numeric AS daily_collected
  FROM base_shifts s
  LEFT JOIN pos.financial_transactions ft
    ON ft.tx_type = 'income'
   AND ft.tx_date >= s.start_time
   AND ft.tx_date <= COALESCE(s.end_time, EXTRACT(EPOCH FROM now()) * 1000)
  GROUP BY s.shift_id
),
targets AS (
  SELECT month, target_revenue, target_profit
  FROM pos.financial_targets
)
SELECT
  s.shift_id,
  s.shift_name,
  s.cashier_name,
  s.team_members,
  s.start_time,
  s.end_time,
  s.status,
  s.starting_cash,
  s.cash_revenue,
  s.qris_revenue,
  s.other_revenue,
  (s.total_revenue + s.total_discount) AS total_gross_sales,
  s.total_discount,
  s.total_revenue,
  s.total_expenses,
  s.total_items_sold,
  COALESCE(o.order_count, 0)     AS order_count,
  COALESCE(o.booking_count, 0)   AS booking_count,
  t.target_revenue,
  COALESCE(t.target_revenue, 0) > 0 AS has_target,
  CASE
    WHEN t.target_revenue IS NULL OR t.target_revenue <= 0 THEN 0
    ELSE t.target_revenue / EXTRACT(DAY FROM date_trunc('month', to_timestamp(s.start_time / 1000.0)) + INTERVAL '1 month - 1 day')
  END AS daily_target,
  CASE
    WHEN t.target_revenue IS NULL OR t.target_revenue <= 0 THEN 0
    ELSE (
      t.target_revenue / EXTRACT(DAY FROM date_trunc('month', to_timestamp(s.start_time / 1000.0)) + INTERVAL '1 month - 1 day')
    ) / GREATEST((SELECT shifts_per_day FROM shift_config), 1)
  END AS shift_target,
  d.daily_collected,
  s.total_revenue AS shift_collected,
  CASE
    WHEN t.target_revenue IS NULL OR t.target_revenue <= 0 THEN FALSE
    ELSE s.total_revenue >= (
      (t.target_revenue / EXTRACT(DAY FROM date_trunc('month', to_timestamp(s.start_time / 1000.0)) + INTERVAL '1 month - 1 day'))
      / GREATEST((SELECT shifts_per_day FROM shift_config), 1)
    )
  END AS is_shift_target_met,
  CASE
    WHEN t.target_revenue IS NULL OR t.target_revenue <= 0 THEN FALSE
    ELSE d.daily_collected >= (
      t.target_revenue / EXTRACT(DAY FROM date_trunc('month', to_timestamp(s.start_time / 1000.0)) + INTERVAL '1 month - 1 day')
    )
  END AS is_daily_target_met
FROM base_shifts s
LEFT JOIN targets t ON t.month = s.month_key
LEFT JOIN orders_per_shift o ON o.shift_id = s.shift_id
LEFT JOIN daily_income d ON d.shift_id = s.shift_id;


-- ── Optimasi pos_orders VIEW ─────────────────────────────────────────────
-- Ganti correlated subquery dengan LEFT JOIN LATERAL

DROP VIEW IF EXISTS public.pos_orders CASCADE;

CREATE VIEW public.pos_orders AS
SELECT
  o.source_id AS _id,
  COALESCE(o.creation_time, o.created_at) AS "_creationTime",
  o.order_number                               AS "orderNumber",
  o.total_amount                               AS "totalAmount",
  o.status,
  o.payment_method                             AS "paymentMethod",
  o.customer_name                              AS "customerName",
  o.table_number                               AS "tableNumber",
  o.order_type                                 AS "orderType",
  o.source,
  o.brand_slug                                 AS "brandSlug",
  o.guest_count                                AS "guestCount",
  o.free_refill_selected                       AS "freeRefillSelected",
  o.dessert_later                              AS "dessertLater",
  o.notes,
  o.created_at                                 AS "createdAt",
  o.voucher_source_id                          AS "voucherId",
  o.discount_amount                            AS "discountAmount",
  o.tax_amount                                 AS "taxAmount",
  o.service_charge_amount                      AS "serviceChargeAmount",
  o.receipt_meta                               AS "receiptMeta",
  o.payment_receipt_kind                       AS "paymentReceiptKind",
  o.payment_gateway                            AS "paymentGateway",
  o.gateway_invoice_id                         AS "gatewayInvoiceId",
  o.auth_user_id                               AS "authUserId",
  o.daily_receipt_no,
  o.receipt_kind,
  COALESCE(oi_items.items, '[]'::jsonb) AS items
FROM pos.orders o
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'productId',    oi.product_source_id,
      'productName',  oi.product_name,
      'variant',      oi.variant,
      'quantity',     oi.quantity,
      'price',        oi.price,
      'originalPrice',oi.original_price,
      'status',       oi.status,
      'hppSnapshot',  oi.hpp_snapshot
    ) ORDER BY oi.line_no
  ) AS items
  FROM pos.order_items oi
  WHERE oi.order_source_id = o.source_id
) oi_items ON true;


-- ── Refresh Grants ───────────────────────────────────────────────────────
GRANT SELECT ON public.pos_shift_reports TO anon, authenticated;
GRANT SELECT ON public.pos_orders TO anon, authenticated;
