-- Admin command center: agregasi sisi server untuk dashboard admin.
--
-- Fungsi di sini HANYA dipanggil lewat Edge Function admin-protected-read
-- (service_role) setelah sesi dan izin Yumi diperiksa. Tidak diberikan ke
-- anon/authenticated. Waktu di pos.orders.created_at, pos.financial_transactions.tx_date
-- dan pos_attendance_logs.timestamp adalah epoch milidetik. Zona laporan: WIB (Asia/Jakarta).
--
-- Tidak mengubah tabel yang sudah ada. Hanya menambah tabel web_page_views (tracking
-- kunjungan web pelanggan) dan fungsi baca/tulis baru.

-- ---------------------------------------------------------------------------
-- 1. Tracking kunjungan web pelanggan
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.web_page_views (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 300),
  source_kind text NOT NULL CHECK (source_kind IN ('direct', 'search', 'social', 'ai', 'referral')),
  device_kind text NOT NULL CHECK (device_kind IN ('mobile', 'tablet', 'desktop', 'unknown')),
  -- md5 dari id acak per browser (disimpan di localStorage); bukan identitas pribadi.
  visitor_hash text NOT NULL CHECK (char_length(visitor_hash) = 32),
  -- true hanya pada halaman pertama sebuah sesi (kunjungan masuk). Sumber dan perangkat
  -- dihitung dari kunjungan masuk; navigasi berikutnya dalam sesi yang sama tidak.
  entry_visit boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_web_page_views_occurred_at ON public.web_page_views (occurred_at);

ALTER TABLE public.web_page_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_page_views FROM anon, authenticated;
GRANT ALL ON public.web_page_views TO service_role;

-- Penulisan publik hanya lewat fungsi ini: path, referrer, dan device divalidasi di sini.
CREATE OR REPLACE FUNCTION public.record_web_page_view(
  p_path text,
  p_referrer text DEFAULT NULL,
  p_device text DEFAULT NULL,
  p_visitor text DEFAULT NULL,
  p_entry boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_path text := left(coalesce(p_path, ''), 300);
  v_host text := lower(regexp_replace(coalesce(p_referrer, ''), '^(https?://)?(www\.)?([^/:?#]*).*$', '\3'));
  v_source text;
  v_device text := CASE WHEN p_device IN ('mobile', 'tablet', 'desktop') THEN p_device ELSE 'unknown' END;
BEGIN
  IF v_path !~ '^/[A-Za-z0-9_./%-]{0,299}$' THEN
    RETURN;
  END IF;
  IF nullif(trim(coalesce(p_visitor, '')), '') IS NULL OR char_length(p_visitor) > 200 THEN
    RETURN;
  END IF;

  IF v_host = '' OR v_host ~ '(^|\.)djiwatentram\.web\.id$' OR v_host ~ '(^|\.)djiwapay\.web\.id$' THEN
    v_source := 'direct';
  ELSIF v_host ~ '(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|meta\.ai|you\.com)$' THEN
    v_source := 'ai';
  ELSIF v_host ~ '(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.[a-z.]+|yandex\.[a-z.]+)$' THEN
    v_source := 'search';
  ELSIF v_host ~ '(^|\.)(instagram\.com|facebook\.com|threads\.net|threads\.com|t\.co|x\.com|twitter\.com|tiktok\.com|youtube\.com|linkedin\.com|whatsapp\.com|wa\.me)$' THEN
    v_source := 'social';
  ELSE
    v_source := 'referral';
  END IF;

  INSERT INTO public.web_page_views (path, source_kind, device_kind, visitor_hash, entry_visit)
  VALUES (v_path, CASE WHEN coalesce(p_entry, false) THEN v_source ELSE 'direct' END, v_device, md5(trim(p_visitor)), coalesce(p_entry, false));
END;
$$;

REVOKE ALL ON FUNCTION public.record_web_page_view(text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_web_page_view(text, text, text, text, boolean) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Penjualan: ringkasan per rentang, tren, heatmap, dan rincian
-- ---------------------------------------------------------------------------

-- p_ranges: [{ "key": "today", "start_ms": 123, "end_ms": 456 }, ...]
CREATE OR REPLACE FUNCTION public.admin_sales_summary(p_ranges jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('key', r.key, 'orders', COALESCE(s.orders, 0), 'revenue', COALESCE(s.revenue, 0))
    ORDER BY r.ord
  ), '[]'::jsonb)
  FROM jsonb_to_recordset(p_ranges) WITH ORDINALITY
    AS r(key text, start_ms double precision, end_ms double precision, ord bigint)
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS orders, COALESCE(sum(o.total_amount), 0) AS revenue
    FROM pos.orders o
    WHERE o.status IN ('paid', 'completed')
      AND o.created_at >= r.start_ms
      AND o.created_at < r.end_ms
  ) s ON true;
$$;

CREATE OR REPLACE FUNCTION public.admin_sales_trend(
  p_start double precision,
  p_end double precision,
  p_bucket text DEFAULT 'day'
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  WITH settled AS (
    SELECT timezone('Asia/Jakarta', to_timestamp(o.created_at / 1000.0)) AS local_ts,
           o.total_amount
    FROM pos.orders o
    WHERE o.status IN ('paid', 'completed')
      AND o.created_at >= p_start
      AND o.created_at < p_end
  ),
  buckets AS (
    SELECT date_trunc(
             CASE WHEN p_bucket IN ('hour', 'day', 'month') THEN p_bucket ELSE 'day' END,
             s.local_ts
           ) AS bucket_local,
           count(*)::bigint AS orders,
           COALESCE(sum(s.total_amount), 0) AS revenue
    FROM settled s
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'bucket', round(extract(epoch FROM (b.bucket_local AT TIME ZONE 'Asia/Jakarta')) * 1000),
      'orders', b.orders,
      'revenue', b.revenue
    )
    ORDER BY b.bucket_local
  ), '[]'::jsonb)
  FROM buckets b;
$$;

-- Heatmap jam x hari (WIB). dow: 1 = Senin ... 7 = Minggu.
CREATE OR REPLACE FUNCTION public.admin_sales_heatmap(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  WITH settled AS (
    SELECT timezone('Asia/Jakarta', to_timestamp(o.created_at / 1000.0)) AS local_ts,
           o.total_amount
    FROM pos.orders o
    WHERE o.status IN ('paid', 'completed')
      AND o.created_at >= p_start
      AND o.created_at < p_end
  ),
  cells AS (
    SELECT extract(isodow FROM s.local_ts)::int AS dow,
           extract(hour FROM s.local_ts)::int AS hour,
           count(*)::bigint AS orders,
           COALESCE(sum(s.total_amount), 0) AS revenue
    FROM settled s
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'sampleDays', (SELECT count(DISTINCT date_trunc('day', s.local_ts)) FROM settled s),
    'cells', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dow', c.dow, 'hour', c.hour, 'orders', c.orders, 'revenue', c.revenue)
                       ORDER BY c.dow, c.hour)
      FROM cells c
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_sales_breakdown(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  WITH period_orders AS (
    SELECT o.source_id,
           o.order_number,
           o.daily_receipt_no,
           o.status,
           o.total_amount,
           o.created_at,
           o.order_channel,
           o.order_type,
           o.brand_slug,
           o.business_unit,
           o.source_app,
           o.source,
           pos.normalize_payment_method(o.payment_method, o.payment_receipt_kind, o.payment_gateway) AS method
    FROM pos.orders o
    WHERE o.created_at >= p_start
      AND o.created_at < p_end
  ),
  settled AS (
    SELECT * FROM period_orders WHERE status IN ('paid', 'completed')
  )
  SELECT jsonb_build_object(
    'statusCounts', (
      SELECT COALESCE(jsonb_object_agg(x.status, x.n), '{}'::jsonb)
      FROM (SELECT status, count(*)::bigint AS n FROM period_orders GROUP BY status) x
    ),
    'methods', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', m.method, 'orders', m.n, 'revenue', m.rev) ORDER BY m.rev DESC), '[]'::jsonb)
      FROM (SELECT method, count(*)::bigint AS n, COALESCE(sum(total_amount), 0) AS rev FROM settled GROUP BY method) m
    ),
    'channels', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', c.channel, 'orders', c.n, 'revenue', c.rev) ORDER BY c.rev DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(order_channel, 'unknown') AS channel, count(*)::bigint AS n, COALESCE(sum(total_amount), 0) AS rev
        FROM settled
        GROUP BY 1
      ) c
    ),
    'products', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', p.name, 'quantity', p.quantity, 'revenue', p.revenue) ORDER BY p.quantity DESC), '[]'::jsonb)
      FROM (
        SELECT oi.product_name AS name,
               COALESCE(sum(oi.quantity), 0) AS quantity,
               COALESCE(sum(oi.quantity * oi.price), 0) AS revenue
        FROM pos.order_items oi
        JOIN settled s ON s.source_id = oi.order_source_id
        WHERE oi.status IS DISTINCT FROM 'cancelled'
        GROUP BY oi.product_name
        ORDER BY COALESCE(sum(oi.quantity), 0) DESC
        LIMIT 8
      ) p
    ),
    'recentOrders', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.source_id,
        'orderNumber', r.order_number,
        'dailyReceiptNo', r.daily_receipt_no,
        'status', r.status,
        'totalAmount', r.total_amount,
        'createdAt', round(r.created_at),
        'orderChannel', r.order_channel,
        'paymentMethod', r.method,
        'orderType', r.order_type,
        'brandSlug', r.brand_slug,
        'businessUnit', r.business_unit,
        'sourceApp', r.source_app,
        'source', r.source,
        'itemCount', (SELECT count(*) FROM pos.order_items oi WHERE oi.order_source_id = r.source_id)
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM period_orders ORDER BY created_at DESC LIMIT 6) r
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Keuangan dan DjiwaPay
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_cashflow_summary(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  WITH tx AS (
    SELECT ft.tx_type, ft.amount
    FROM pos.financial_transactions ft
    WHERE ft.status = 'completed'
      AND ft.tx_date >= p_start
      AND ft.tx_date < p_end
  )
  SELECT jsonb_build_object(
    'income', COALESCE(sum(amount) FILTER (WHERE tx_type = 'income'), 0),
    'expense', COALESCE(sum(amount) FILTER (WHERE tx_type = 'expense'), 0),
    'net', COALESCE(sum(CASE WHEN tx_type = 'income' THEN amount WHEN tx_type = 'expense' THEN -amount ELSE 0 END), 0)
  )
  FROM tx;
$$;

CREATE OR REPLACE FUNCTION public.admin_djiwapay_overview(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  WITH pay AS (
    SELECT o.status, o.total_amount, o.order_channel
    FROM pos.orders o
    WHERE o.created_at >= p_start
      AND o.created_at < p_end
      AND pos.normalize_payment_method(o.payment_method, o.payment_receipt_kind, o.payment_gateway) = 'djiwa_pay'
  ),
  wallet_totals AS (
    SELECT count(*) FILTER (WHERE w.status = 'active')::bigint AS active_wallets,
           COALESCE(sum(w.available_balance), 0) AS available_balance,
           COALESCE(sum(w.held_balance), 0) AS held_balance
    FROM pos.customer_wallets w
  ),
  ledger AS (
    SELECT l.id, l.direction, l.amount, l.transaction_type, l.note, l.created_at
    FROM pos.customer_wallet_ledger l
    WHERE l.created_at >= to_timestamp(p_start / 1000.0)
      AND l.created_at < to_timestamp(p_end / 1000.0)
    ORDER BY l.created_at DESC
    LIMIT 8
  )
  SELECT jsonb_build_object(
    'volume', COALESCE((SELECT sum(total_amount) FROM pay WHERE status IN ('paid', 'completed')), 0),
    'transactions', (SELECT count(*)::bigint FROM pay WHERE status IN ('paid', 'completed')),
    'statusCounts', (
      SELECT COALESCE(jsonb_object_agg(x.status, x.n), '{}'::jsonb)
      FROM (SELECT status, count(*)::bigint AS n FROM pay GROUP BY status) x
    ),
    'channels', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', c.channel, 'orders', c.n, 'revenue', c.rev) ORDER BY c.rev DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(order_channel, 'unknown') AS channel, count(*)::bigint AS n, COALESCE(sum(total_amount), 0) AS rev
        FROM pay
        WHERE status IN ('paid', 'completed')
        GROUP BY 1
      ) c
    ),
    'activeWallets', (SELECT active_wallets FROM wallet_totals),
    'availableBalance', (SELECT available_balance FROM wallet_totals),
    'heldBalance', (SELECT held_balance FROM wallet_totals),
    'ledger', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'direction', l.direction,
        'amount', l.amount,
        'transactionType', l.transaction_type,
        'note', l.note,
        'createdAt', round(extract(epoch FROM l.created_at) * 1000)
      ) ORDER BY l.created_at DESC), '[]'::jsonb)
      FROM ledger l
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Kehadiran karyawan (dengan nama)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_attendance_today(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH staff AS (
    SELECT u._id, u.name, u."roleName"
    FROM public.pos_users_public u
    WHERE COALESCE(u."isActive", true)
  ),
  logs AS (
    SELECT a."userId", a.type, a."timestamp"::double precision AS ts
    FROM public.pos_attendance_logs a
    WHERE a."timestamp" >= p_start
      AND a."timestamp" < p_end
  ),
  last_log AS (
    SELECT DISTINCT ON (l."userId") l."userId", l.type
    FROM logs l
    ORDER BY l."userId", l.ts DESC
  ),
  first_in AS (
    SELECT l."userId", min(l.ts) AS check_in
    FROM logs l
    WHERE l.type = 'check_in'
    GROUP BY l."userId"
  ),
  last_out AS (
    SELECT l."userId", max(l.ts) AS check_out
    FROM logs l
    WHERE l.type = 'check_out'
    GROUP BY l."userId"
  ),
  leave_today AS (
    SELECT DISTINCT ON (lr.user_id) lr.user_id, lr.leave_type
    FROM public.attendance_leave_requests lr
    WHERE lr.status = 'approved'
      AND lr.start_date <= (to_timestamp(p_start / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
      AND lr.end_date >= (to_timestamp(p_start / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
    ORDER BY lr.user_id, lr.start_date DESC
  ),
  staff_rows AS (
    SELECT s._id AS "userId",
           s.name,
           s."roleName" AS role_name,
           CASE
             WHEN ll.type = 'check_in' THEN 'working'
             WHEN fi."userId" IS NOT NULL THEN 'done'
             WHEN lv.user_id IS NOT NULL THEN 'leave'
             ELSE 'absent'
           END AS status,
           fi.check_in AS "checkInAt",
           lo.check_out AS "checkOutAt",
           lv.leave_type AS "leaveType"
    FROM staff s
    LEFT JOIN last_log ll ON ll."userId" = s._id
    LEFT JOIN first_in fi ON fi."userId" = s._id
    LEFT JOIN last_out lo ON lo."userId" = s._id
    LEFT JOIN leave_today lv ON lv.user_id = s._id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM staff),
    'present', (SELECT count(*) FROM staff_rows WHERE "checkInAt" IS NOT NULL),
    'staff', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'userId', r."userId",
        'name', r.name,
        'role', r.role_name,
        'status', r.status,
        'checkInAt', r."checkInAt",
        'checkOutAt', r."checkOutAt",
        'leaveType', r."leaveType"
      ) ORDER BY CASE r.status WHEN 'working' THEN 0 WHEN 'done' THEN 1 WHEN 'leave' THEN 2 ELSE 3 END, r.name), '[]'::jsonb)
      FROM staff_rows r
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Aktivitas langsung lintas aplikasi
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_activity_feed(p_limit integer DEFAULT 8)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  WITH events AS (
    (SELECT round(o.created_at)::double precision AS at_ms,
            'order'::text AS kind,
            CASE COALESCE(o.order_channel, '')
              WHEN 'pos' THEN 'POS'
              WHEN 'app' THEN 'DJIWAAPP'
              WHEN 'booking' THEN 'BOOKING'
              WHEN 'telegram' THEN 'TELEGRAM'
              ELSE 'ONLINE'
            END AS app,
            o.status::text AS status,
            COALESCE(o.order_number, left(o.source_id, 8))::text AS name,
            COALESCE(o.total_amount, 0)::double precision AS amount,
            NULL::text AS detail
     FROM pos.orders o
     ORDER BY o.created_at DESC NULLS LAST
     LIMIT 12)
    UNION ALL
    (SELECT a."timestamp"::double precision,
            'attendance'::text,
            'KARYAWAN'::text,
            a.type::text,
            COALESCE(u.name, 'Karyawan')::text,
            0::double precision,
            NULL::text
     FROM public.pos_attendance_logs a
     LEFT JOIN public.pos_users_public u ON u._id = a."userId"
     ORDER BY a."timestamp" DESC
     LIMIT 12)
    UNION ALL
    (SELECT round(extract(epoch FROM l.created_at) * 1000)::double precision,
            'wallet'::text,
            'DJIWAPAY'::text,
            l.transaction_type::text,
            COALESCE(l.note, 'Mutasi dompet')::text,
            l.amount::double precision,
            l.direction::text
     FROM pos.customer_wallet_ledger l
     ORDER BY l.created_at DESC
     LIMIT 12)
    UNION ALL
    (SELECT round(extract(epoch FROM d.paid_at) * 1000)::double precision,
            'donation'::text,
            'JUMAT BERKAH'::text,
            d.status::text,
            COALESCE(d.display_name, 'Donatur')::text,
            d.amount::double precision,
            d.portions::text
     FROM pos.jumat_berkah_donations d
     WHERE d.status = 'paid' AND d.paid_at IS NOT NULL
     ORDER BY d.paid_at DESC
     LIMIT 8)
    UNION ALL
    (SELECT b."createdAt"::double precision,
            'booking'::text,
            'BOOKING'::text,
            b."bookingStatus"::text,
            COALESCE(b."customerName", 'Tamu')::text,
            COALESCE(b."totalAmount", 0)::double precision,
            COALESCE(b."guestCount", 0)::text
     FROM public.pos_booking_orders b
     ORDER BY b."createdAt" DESC
     LIMIT 8)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'at', e.at_ms,
    'kind', e.kind,
    'app', e.app,
    'status', e.status,
    'name', e.name,
    'amount', e.amount,
    'detail', e.detail
  ) ORDER BY e.at_ms DESC), '[]'::jsonb)
  FROM (SELECT * FROM events ORDER BY at_ms DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 30)) e;
$$;

-- ---------------------------------------------------------------------------
-- 6. Kartu ekosistem aplikasi (hanya sumber yang terverifikasi di migrasi)
-- ---------------------------------------------------------------------------

-- Hitung titik per dari 8 bucket dalam rentang. Titik di luar rentang diabaikan.
CREATE OR REPLACE FUNCTION public.admin_spark_counts(
  p_start double precision,
  p_end double precision,
  p_points double precision[]
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(c.n ORDER BY x.bucket), '[]'::jsonb)
  FROM generate_series(1, 8) AS x(bucket)
  CROSS JOIN LATERAL (
    SELECT count(*)::bigint AS n
    FROM unnest(COALESCE(p_points, '{}'::double precision[])) AS pt(value)
    WHERE width_bucket(pt.value, p_start, p_end, 8) = x.bucket
  ) c;
$$;

CREATE OR REPLACE FUNCTION public.admin_ecosystem_summary(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  WITH
  pos_sales AS (
    SELECT o.created_at AS at_ms
    FROM pos.orders o
    WHERE o.status IN ('paid', 'completed')
      AND o.order_channel = 'pos'
      AND o.created_at >= p_start AND o.created_at < p_end
  ),
  djiwapay_sales AS (
    SELECT o.created_at AS at_ms, o.total_amount AS amount
    FROM pos.orders o
    WHERE o.status IN ('paid', 'completed')
      AND pos.normalize_payment_method(o.payment_method, o.payment_receipt_kind, o.payment_gateway) = 'djiwa_pay'
      AND o.created_at >= p_start AND o.created_at < p_end
  ),
  web_views AS (
    SELECT round(extract(epoch FROM v.occurred_at) * 1000)::double precision AS at_ms
    FROM public.web_page_views v
    WHERE v.occurred_at >= to_timestamp(p_start / 1000.0)
      AND v.occurred_at < to_timestamp(p_end / 1000.0)
  ),
  bookings AS (
    SELECT b."createdAt"::double precision AS at_ms
    FROM public.pos_booking_orders b
    WHERE COALESCE(b."bookingStatus", '') NOT IN ('cancelled', 'canceled', 'rejected')
      AND b."createdAt" >= p_start AND b."createdAt" < p_end
  ),
  check_ins AS (
    SELECT a."timestamp"::double precision AS at_ms, a."userId" AS user_id
    FROM public.pos_attendance_logs a
    WHERE a.type = 'check_in'
      AND a."timestamp" >= p_start AND a."timestamp" < p_end
  ),
  merch AS (
    SELECT round(extract(epoch FROM r.held_at) * 1000)::double precision AS at_ms
    FROM pos.merchandise_reservations r
    WHERE r.status IN ('held', 'confirmed')
      AND r.held_at >= to_timestamp(p_start / 1000.0)
      AND r.held_at < to_timestamp(p_end / 1000.0)
  ),
  jumat AS (
    SELECT round(extract(epoch FROM d.paid_at) * 1000)::double precision AS at_ms, d.portions
    FROM pos.jumat_berkah_donations d
    WHERE d.status = 'paid'
      AND d.paid_at >= to_timestamp(p_start / 1000.0)
      AND d.paid_at < to_timestamp(p_end / 1000.0)
  ),
  candidates AS (
    SELECT round(extract(epoch FROM c.created_at) * 1000)::double precision AS at_ms
    FROM pos.recruitment_candidates c
    WHERE c.created_at >= to_timestamp(p_start / 1000.0)
      AND c.created_at < to_timestamp(p_end / 1000.0)
  ),
  stock AS (
    SELECT count(*)::bigint AS critical
    FROM pos.inventory i
    WHERE i.quantity <= i."lowStockThreshold"
  )
  SELECT jsonb_build_array(
    jsonb_build_object(
      'key', 'pos', 'name', 'POS Kasir', 'domain', 'pos.djiwatentram.web.id',
      'value', (SELECT count(*) FROM pos_sales), 'valueKind', 'count', 'label', 'order settled', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM pos_sales))
    ),
    jsonb_build_object(
      'key', 'web', 'name', 'Web pelanggan', 'domain', 'djiwatentram.web.id',
      'value', (SELECT count(*) FROM web_views), 'valueKind', 'count', 'label', 'halaman dibaca', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM web_views))
    ),
    jsonb_build_object(
      'key', 'djiwapay', 'name', 'DjiwaPay', 'domain', 'djiwapay.web.id',
      'value', COALESCE((SELECT sum(amount) FROM djiwapay_sales), 0), 'valueKind', 'rupiah',
      'label', (SELECT count(*) FROM djiwapay_sales)::text || ' transaksi', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM djiwapay_sales))
    ),
    jsonb_build_object(
      'key', 'booking', 'name', 'Booking', 'domain', 'booking.djiwatentram.web.id',
      'value', (SELECT count(*) FROM bookings), 'valueKind', 'count', 'label', 'reservasi', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM bookings))
    ),
    jsonb_build_object(
      'key', 'karyawan', 'name', 'Karyawan', 'domain', 'karyawan.djiwatentram.web.id',
      'value', (SELECT count(DISTINCT user_id) FROM check_ins), 'valueKind', 'count', 'label', 'staf unik hadir', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM check_ins))
    ),
    jsonb_build_object(
      'key', 'merchandise', 'name', 'Merchandise', 'domain', 'merchandise.djiwatentram.web.id',
      'value', (SELECT count(*) FROM merch), 'valueKind', 'count', 'label', 'reservasi', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM merch))
    ),
    jsonb_build_object(
      'key', 'jumat', 'name', 'Jumat Berkah', 'domain', 'djiwatentram.web.id/jumat-berkah',
      'value', COALESCE((SELECT sum(portions) FROM jumat), 0), 'valueKind', 'count', 'label', 'porsi terbayar', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM jumat))
    ),
    jsonb_build_object(
      'key', 'rekrutmen', 'name', 'Rekrutmen', 'domain', 'rekrutmen.djiwatentram.web.id',
      'value', (SELECT count(*) FROM candidates), 'valueKind', 'count', 'label', 'pelamar baru', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM candidates))
    ),
    jsonb_build_object(
      'key', 'stok', 'name', 'Stok & inventori', 'domain', 'admin.djiwatentram.web.id',
      'value', (SELECT critical FROM stock), 'valueKind', 'count', 'label', 'stok kritis',
      'status', CASE WHEN (SELECT critical FROM stock) > 0 THEN 'warn' ELSE 'ok' END,
      'spark', '[]'::jsonb
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. Lalu lintas web dan daftar tindakan
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_web_traffic(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH v AS (
    SELECT * FROM public.web_page_views
    WHERE occurred_at >= to_timestamp(p_start / 1000.0)
      AND occurred_at < to_timestamp(p_end / 1000.0)
  )
  SELECT jsonb_build_object(
    'views', (SELECT count(*) FROM v),
    'visitors', (SELECT count(DISTINCT visitor_hash) FROM v),
    'sources', (SELECT COALESCE(jsonb_object_agg(x.source_kind, x.n), '{}'::jsonb) FROM (SELECT source_kind, count(*)::bigint AS n FROM v WHERE entry_visit GROUP BY source_kind) x),
    'devices', (SELECT COALESCE(jsonb_object_agg(x.device_kind, x.n), '{}'::jsonb) FROM (SELECT device_kind, count(*)::bigint AS n FROM v WHERE entry_visit GROUP BY device_kind) x),
    'topPaths', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('path', p.path, 'views', p.n) ORDER BY p.n DESC), '[]'::jsonb)
      FROM (SELECT path, count(*)::bigint AS n FROM v GROUP BY path ORDER BY count(*) DESC, path LIMIT 6) p
    ),
    'trackingSince', (SELECT round(extract(epoch FROM min(occurred_at)) * 1000) FROM public.web_page_views)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_actions_summary(p_now double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'stockCritical', (SELECT count(*) FROM pos.inventory i WHERE i.quantity <= i."lowStockThreshold"),
    'stockItems', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', x.name, 'quantity', x.quantity, 'threshold', x.threshold)), '[]'::jsonb)
      FROM (
        SELECT i."ingredientName" AS name, i.quantity, i."lowStockThreshold" AS threshold
        FROM pos.inventory i
        WHERE i.quantity <= i."lowStockThreshold"
        ORDER BY (i.quantity - i."lowStockThreshold")
        LIMIT 4
      ) x
    ),
    'pendingOverFifteen', (
      SELECT count(*) FROM pos.orders o
      WHERE o.status = 'pending' AND o.created_at < p_now - 15 * 60000
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. Hak akses: hanya service_role (Edge Function admin-protected-read)
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.admin_sales_summary(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_sales_trend(double precision, double precision, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_sales_heatmap(double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_sales_breakdown(double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_cashflow_summary(double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_djiwapay_overview(double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_attendance_today(double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_activity_feed(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_spark_counts(double precision, double precision, double precision[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_ecosystem_summary(double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_web_traffic(double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_actions_summary(double precision) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_sales_summary(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_sales_trend(double precision, double precision, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_sales_heatmap(double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_sales_breakdown(double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_cashflow_summary(double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_djiwapay_overview(double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_attendance_today(double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_activity_feed(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_spark_counts(double precision, double precision, double precision[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ecosystem_summary(double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_web_traffic(double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_actions_summary(double precision) TO service_role;
