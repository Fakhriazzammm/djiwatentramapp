-- === Yumi Poin: 1000 poin per transaksi selesai ===
-- Memberikan 1000 Yumi Poin ke customer setiap kali order berstatus "paid" atau "completed"
-- Poin hanya diberikan sekali per order (cek reference_id di customer_point_ledger)

-- 1. Function untuk award poin
CREATE OR REPLACE FUNCTION pos.award_order_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_points INT;
  v_current_lifetime INT;
  v_already_awarded BOOLEAN;
BEGIN
  -- Hanya trigger untuk status paid atau completed
  IF NEW.status NOT IN ('paid', 'completed') THEN
    RETURN NEW;
  END IF;

  -- Pastikan customer_source_id ada
  IF NEW.customer_source_id IS NULL OR NEW.customer_source_id = '' THEN
    RETURN NEW;
  END IF;

  -- Cek apakah poin sudah pernah diberikan untuk order ini
  SELECT EXISTS (
    SELECT 1 FROM pos.customer_point_ledger
    WHERE reference_id = NEW.source_id AND reason = 'order_points'
  ) INTO v_already_awarded;

  IF v_already_awarded THEN
    RETURN NEW;
  END IF;

  -- Ambil poin saat ini
  SELECT COALESCE(total_points, 0), COALESCE(lifetime_points, 0)
  INTO v_current_points, v_current_lifetime
  FROM pos.customers
  WHERE source_id = NEW.customer_source_id;

  -- Jika customer belum ada, skip
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Tambah 1000 poin
  UPDATE pos.customers
  SET
    total_points = v_current_points + 1000,
    lifetime_points = v_current_lifetime + 1000,
    total_orders = COALESCE(total_orders, 0) + 1,
    last_order_at = NOW(),
    updated_at = NOW()
  WHERE source_id = NEW.customer_source_id;

  -- Catat di ledger
  INSERT INTO pos.customer_point_ledger (customer_id, points, balance_after, reason, reference_id, note, created_at)
  VALUES (
    NEW.customer_source_id,
    1000,
    v_current_points + 1000,
    'order_points',
    NEW.source_id,
    'Yumi Poin: 1000 poin dari pesanan #' || COALESCE(NEW.order_number, ''),
    NOW()
  );

  RETURN NEW;
END;
$$;

-- 2. Trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_award_order_points ON pos.orders;
CREATE TRIGGER trg_award_order_points
  AFTER INSERT OR UPDATE OF status ON pos.orders
  FOR EACH ROW
  EXECUTE FUNCTION pos.award_order_points();
