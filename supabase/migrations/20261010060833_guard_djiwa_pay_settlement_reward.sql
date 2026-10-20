-- Restrict automatic Djiwa Pay rewards to wallet settlements for real customers.
-- Guest QRIS/Mayar IDs are not pos.customers IDs: awarding them creates a wallet
-- with an invalid customer FK and rolls back the payment settlement.
-- Keep function identity/privileges and the existing trigger name/events intact.
-- Do not change wallet_settle_order or the reward function's idempotency logic.
BEGIN;

CREATE OR REPLACE FUNCTION pos.award_djiwa_pay_reward_on_order_settled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  IF NEW.status IN ('paid', 'completed')
     AND COALESCE(trim(NEW.customer_source_id), '') <> ''
     -- Explicit external-payment markers override conflicting wallet markers.
     AND lower(trim(COALESCE(NEW.payment_method, ''))) NOT IN ('qris', 'gateway_paid')
     AND lower(trim(COALESCE(NEW.payment_receipt_kind, ''))) NOT IN ('qris', 'gateway_paid')
     AND (
       lower(trim(COALESCE(NEW.payment_receipt_kind, ''))) = 'wallet_paid'
       OR lower(trim(COALESCE(NEW.payment_method, ''))) IN ('wallet', 'djiwa_pay')
     ) THEN
    -- Check the exact FK identity, not a trimmed/rewritten guest identifier.
    -- Hold a key-share lock through the reward insert to prevent a concurrent
    -- customer deletion/key change between this check and wallet creation.
    PERFORM 1 FROM pos.customers
    WHERE source_id = NEW.customer_source_id
    FOR KEY SHARE;

    IF FOUND THEN
      PERFORM pos.grant_djiwa_pay_transaction_reward(NEW.customer_source_id, NEW.source_id, 1000);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Transactional drop/recreate is repeatable and exposes no trigger-free window
-- to concurrent settlements. Retain AFTER INSERT / UPDATE OF status behavior.
DROP TRIGGER IF EXISTS trg_award_djiwa_pay_reward ON pos.orders;
CREATE TRIGGER trg_award_djiwa_pay_reward
AFTER INSERT OR UPDATE OF status ON pos.orders
FOR EACH ROW EXECUTE FUNCTION pos.award_djiwa_pay_reward_on_order_settled();

COMMIT;
