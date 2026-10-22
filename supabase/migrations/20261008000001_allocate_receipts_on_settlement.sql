-- Allocate customer/POS receipt numbers only when an order is financially settled.
-- Pending orders intentionally keep daily_receipt_no NULL so abandoned checkout
-- attempts cannot consume visible receipt numbers.

CREATE OR REPLACE FUNCTION pos.next_daily_receipt_no(p_order_kind TEXT DEFAULT 'all')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
    business_date TEXT := to_char(timezone('Asia/Jakarta', now()), 'YYYY-MM-DD');
    next_no INTEGER;
BEGIN
    INSERT INTO pos.daily_receipt_counter (date, order_kind, last_no)
    VALUES (business_date, 'all', 1)
    ON CONFLICT (date, order_kind)
    DO UPDATE SET last_no = pos.daily_receipt_counter.last_no + 1
    RETURNING last_no INTO next_no;
    RETURN next_no;
END;
$$;

CREATE OR REPLACE FUNCTION pos.assign_receipt_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
    kind TEXT;
BEGIN
    IF NEW.status IN ('paid', 'completed')
       AND NEW.daily_receipt_no IS NULL THEN
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
            'receiptAllocationReason', 'settled_order'
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
