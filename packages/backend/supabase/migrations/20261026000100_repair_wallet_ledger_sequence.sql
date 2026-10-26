-- Restored/imported ledger IDs must not collide with the next generated ID.
BEGIN;
LOCK TABLE pos.customer_wallet_ledger IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  v_max bigint;
  v_last bigint;
  v_called boolean;
BEGIN
  SELECT max(id) INTO v_max FROM pos.customer_wallet_ledger;
  SELECT last_value, is_called INTO v_last, v_called FROM pos.customer_wallet_ledger_id_seq;
  IF v_max IS NOT NULL AND (v_last < v_max OR (v_last = v_max AND NOT v_called)) THEN
    PERFORM setval('pos.customer_wallet_ledger_id_seq'::regclass, v_max, true);
  END IF;
END $$;
COMMIT;
