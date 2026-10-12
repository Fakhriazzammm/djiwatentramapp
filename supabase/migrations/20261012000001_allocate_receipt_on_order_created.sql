-- Alokasikan nomor struk sejak order dibuat, bukan hanya saat settlement.
--
-- Konteks: 20261008000001 menahan nomor struk sampai order lunas supaya
-- checkout yang ditinggalkan tidak memakan nomor. Akibatnya order DjiwaApp
-- "Bayar Tunai di Kasir" yang lahir berstatus `pending` tidak punya nomor,
-- sehingga tiket dapur/barista dan notifikasi Telegram kehilangan baris
-- `📍 STRUK NO. n` dan menampilkan ID placeholder `ORD-...-0000-...` yang
-- sama untuk semua order.
--
-- Fungsi ini mengembalikan alokasi saat order dibuat, dan tetap
-- mempertahankan alokasi saat settlement sebagai fallback untuk baris lama
-- yang masih NULL (mis. order pending sebelum migration ini).
-- Idempotent: CREATE OR REPLACE + DROP/CREATE TRIGGER.

CREATE OR REPLACE FUNCTION pos.assign_receipt_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
    kind TEXT;
BEGIN
    IF NEW.daily_receipt_no IS NULL
       AND COALESCE(NEW.status, '') <> 'cancelled'
       AND (TG_OP = 'INSERT' OR NEW.status IN ('paid', 'completed')) THEN
        kind := COALESCE(
            NULLIF(trim(NEW.receipt_kind), ''),
            CASE
                WHEN NEW.source = 'pos' AND NEW.order_type = 'takeaway' THEN 'takeaway'
                WHEN NEW.source = 'pos' THEN 'dine_in'
                WHEN NEW.source = 'customer_self_service' THEN 'dine_in'
                ELSE 'online'
            END
        );
        NEW.daily_receipt_no := pos.next_daily_receipt_no(kind);
        NEW.receipt_kind := kind;
        NEW.raw := COALESCE(NEW.raw, '{}'::jsonb) || jsonb_build_object(
            'receiptAllocatedAt', extract(epoch from clock_timestamp()) * 1000,
            'receiptAllocationReason',
            CASE WHEN TG_OP = 'INSERT' THEN 'order_created' ELSE 'settled_order' END
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_receipt_on_settlement ON pos.orders;
CREATE TRIGGER trg_assign_receipt_on_settlement
BEFORE INSERT OR UPDATE OF status ON pos.orders
FOR EACH ROW
EXECUTE FUNCTION pos.assign_receipt_on_settlement();

GRANT EXECUTE ON FUNCTION pos.assign_receipt_on_settlement() TO service_role;
