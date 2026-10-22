-- Internal Djiwa Pay wallet transfer.
-- This is store-credit movement between existing customer wallets only;
-- it does not provide cash-out or external bank payout.

ALTER TABLE pos.customer_wallet_ledger
  DROP CONSTRAINT IF EXISTS customer_wallet_ledger_transaction_type_check;

ALTER TABLE pos.customer_wallet_ledger
  ADD CONSTRAINT customer_wallet_ledger_transaction_type_check CHECK (
    transaction_type = ANY (ARRAY[
      'topup_pending', 'topup_completed', 'wallet_hold', 'wallet_capture',
      'wallet_release', 'order_debit', 'transaction_reward', 'refund',
      'manual_credit', 'manual_debit', 'adjustment',
      'wallet_transfer_sent', 'wallet_transfer_received'
    ])
  );

CREATE INDEX IF NOT EXISTS idx_customer_wallet_ledger_transfer_reference
  ON pos.customer_wallet_ledger (reference_type, reference_id)
  WHERE reference_type = 'wallet_transfer';

CREATE OR REPLACE FUNCTION pos.wallet_transfer(
  p_sender_customer_id text,
  p_recipient_customer_id text,
  p_amount bigint,
  p_idempotency_key text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_sender pos.customer_wallets;
  v_recipient pos.customer_wallets;
  v_transfer_id text := 'wtx_' || md5(trim(p_sender_customer_id) || ':' || trim(p_recipient_customer_id) || ':' || trim(p_idempotency_key));
  v_sender_balance bigint;
  v_recipient_balance bigint;
BEGIN
  IF coalesce(trim(p_sender_customer_id), '') = '' OR coalesce(trim(p_recipient_customer_id), '') = '' THEN
    RAISE EXCEPTION 'Pengirim dan penerima wajib diisi';
  END IF;
  IF trim(p_sender_customer_id) = trim(p_recipient_customer_id) THEN
    RAISE EXCEPTION 'Wallet pengirim dan penerima harus berbeda';
  END IF;
  IF p_amount < 1000 OR p_amount > 10000000 THEN
    RAISE EXCEPTION 'Nominal transfer harus Rp1.000 sampai Rp10.000.000';
  END IF;
  IF coalesce(trim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Idempotency key wajib diisi';
  END IF;
  IF EXISTS (SELECT 1 FROM pos.customer_wallet_ledger WHERE idempotency_key = trim(p_idempotency_key) || ':sent') THEN
    SELECT available_balance INTO v_sender_balance FROM pos.customer_wallets WHERE customer_id = trim(p_sender_customer_id);
    SELECT available_balance INTO v_recipient_balance FROM pos.customer_wallets WHERE customer_id = trim(p_recipient_customer_id);
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'status', 'completed', 'transfer_id', v_transfer_id, 'sender_balance', v_sender_balance, 'recipient_balance', v_recipient_balance);
  END IF;

  PERFORM pos.wallet_ensure(trim(p_sender_customer_id));
  PERFORM pos.wallet_ensure(trim(p_recipient_customer_id));

  -- Lock in a deterministic order so opposite-direction transfers cannot deadlock.
  IF trim(p_sender_customer_id) < trim(p_recipient_customer_id) THEN
    SELECT * INTO v_sender FROM pos.customer_wallets WHERE customer_id = trim(p_sender_customer_id) FOR UPDATE;
    SELECT * INTO v_recipient FROM pos.customer_wallets WHERE customer_id = trim(p_recipient_customer_id) FOR UPDATE;
  ELSE
    SELECT * INTO v_recipient FROM pos.customer_wallets WHERE customer_id = trim(p_recipient_customer_id) FOR UPDATE;
    SELECT * INTO v_sender FROM pos.customer_wallets WHERE customer_id = trim(p_sender_customer_id) FOR UPDATE;
  END IF;
  IF v_sender.status <> 'active' OR v_recipient.status <> 'active' THEN
    RAISE EXCEPTION 'Wallet pengirim atau penerima tidak aktif';
  END IF;
  IF v_sender.available_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_BALANCE', 'available_balance', v_sender.available_balance, 'required', p_amount);
  END IF;

  v_sender_balance := v_sender.available_balance - p_amount;
  v_recipient_balance := v_recipient.available_balance + p_amount;
  UPDATE pos.customer_wallets
  SET available_balance = v_sender_balance, total_debited = total_debited + p_amount, updated_at = now()
  WHERE customer_id = trim(p_sender_customer_id);
  UPDATE pos.customer_wallets
  SET available_balance = v_recipient_balance, total_credited = total_credited + p_amount, updated_at = now()
  WHERE customer_id = trim(p_recipient_customer_id);

  INSERT INTO pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type, reference_type, reference_id, idempotency_key, note)
  VALUES (trim(p_sender_customer_id), p_amount, 'debit', v_sender_balance, 'completed', 'wallet_transfer_sent', 'wallet_transfer', v_transfer_id, trim(p_idempotency_key) || ':sent', coalesce(nullif(trim(p_note), ''), 'Transfer saldo Djiwa Pay'));
  INSERT INTO pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type, reference_type, reference_id, idempotency_key, note)
  VALUES (trim(p_recipient_customer_id), p_amount, 'credit', v_recipient_balance, 'completed', 'wallet_transfer_received', 'wallet_transfer', v_transfer_id, trim(p_idempotency_key) || ':received', 'Transfer saldo Djiwa Pay');
  RETURN jsonb_build_object('ok', true, 'dedup', false, 'status', 'completed', 'transfer_id', v_transfer_id, 'amount', p_amount, 'sender_balance', v_sender_balance, 'recipient_balance', v_recipient_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION pos.wallet_transfer(text, text, bigint, text, text) TO service_role;
