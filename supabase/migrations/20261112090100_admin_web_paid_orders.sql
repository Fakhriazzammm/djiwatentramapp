-- Count paid customer-site orders in the ecosystem card, using the same WIB range.
CREATE OR REPLACE FUNCTION public.admin_ecosystem_summary(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH
  pos_sales AS (
    SELECT o.created_at AS at_ms
    FROM pos.orders o
    WHERE o.status IN ('paid', 'completed')
      AND public.admin_order_channel(o.order_channel, o.source, o.source_app, o.business_unit) = 'pos'
      AND o.created_at >= p_start AND o.created_at < p_end
  ),
  djiwapay_sales AS (
    SELECT o.created_at AS at_ms, o.total_amount AS amount
    FROM pos.orders o
    WHERE o.status IN ('paid', 'completed')
      AND pos.normalize_payment_method(o.payment_method, o.payment_receipt_kind, o.payment_gateway) = 'djiwa_pay'
      AND o.created_at >= p_start AND o.created_at < p_end
  ),
  web_orders AS (
    SELECT o.created_at AS at_ms
    FROM pos.orders o
    WHERE o.status IN ('paid', 'completed')
      AND o.source = 'customer_self_service'
      AND o.brand_slug = 'djiwatentram'
      AND o.created_at >= p_start AND o.created_at < p_end
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
    WHERE i.quantity <= i.low_stock_threshold
  )
  SELECT jsonb_build_array(
    jsonb_build_object(
      'key', 'pos', 'name', 'POS Kasir', 'domain', 'pos.djiwatentram.web.id',
      'value', (SELECT count(*) FROM pos_sales), 'valueKind', 'count', 'label', 'order settled', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM pos_sales))
    ),
    jsonb_build_object(
      'key', 'web', 'name', 'Web pelanggan', 'domain', 'djiwatentram.web.id',
      'value', (SELECT count(*) FROM web_orders), 'valueKind', 'count', 'label', 'pesanan terbayar', 'status', 'ok',
      'spark', public.admin_spark_counts(p_start, p_end, (SELECT array_agg(at_ms) FROM web_orders))
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

REVOKE ALL ON FUNCTION public.admin_ecosystem_summary(double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ecosystem_summary(double precision, double precision) TO service_role;
