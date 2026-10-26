-- Pending/open-bill orders do not reserve a visible receipt number. When the
-- payment is settled, allocate the number and create the canonical display
-- order number in the same trigger transition.

CREATE OR REPLACE FUNCTION pos.assign_receipt_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
DECLARE
    kind TEXT;
    channel_code TEXT;
    type_code TEXT;
    date_code TEXT;
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

        channel_code := CASE
            WHEN NEW.brand_slug = 'merchandise' THEN 'MERCH'
            WHEN NEW.brand_slug = 'b2b' OR NEW.business_unit = 'b2b' THEN 'B2B'
            WHEN NEW.business_unit IN ('ordermieyamin', 'mieyamin') THEN 'APP'
            WHEN NEW.source = 'customer_self_service' THEN 'APP'
            WHEN NEW.source = 'pos' OR NEW.source IS NULL THEN 'POS'
            ELSE 'UNK'
        END;
        type_code := CASE
            WHEN NEW.order_type IN ('dine_in', 'dinein') THEN 'D'
            WHEN NEW.order_type IN ('takeaway', 'take_away') THEN 'T'
            WHEN NEW.order_type = 'delivery' THEN 'DL'
            WHEN NEW.order_type = 'online' THEN 'O'
            ELSE 'X'
        END;
        date_code := to_char(timezone('Asia/Jakarta', now()), 'DDMMYY');
        NEW.order_number := format(
            'ORD-%s-%s-%s-%s',
            channel_code,
            type_code,
            lpad(NEW.daily_receipt_no::text, 4, '0'),
            date_code
        );
        NEW.raw := COALESCE(NEW.raw, '{}'::jsonb) || jsonb_build_object(
            'receiptAllocatedAt', extract(epoch from clock_timestamp()) * 1000,
            'receiptAllocationReason', 'settled_order'
        );
    END IF;
    RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
