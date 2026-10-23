-- Djiwa Pay transaction projection and customer wallet notifications.
-- Wallet balances and ledger rows remain authoritative.

ALTER TABLE public.pos_notifications
  DROP CONSTRAINT IF EXISTS pos_notifications_notification_type_check;

ALTER TABLE public.pos_notifications
  ADD CONSTRAINT pos_notifications_notification_type_check CHECK (
    notification_type = ANY (ARRAY[
      'order_cashier_pending', 'order_mayar_pending', 'order_paid',
      'order_payment_failed', 'admin_info', 'admin_briefing',
      'wallet_transfer_sent', 'wallet_transfer_received'
    ])
  );

CREATE INDEX IF NOT EXISTS pos_notifications_wallet_target_idx
  ON public.pos_notifications (target_user_id, created_at DESC)
  WHERE notification_type IN ('wallet_transfer_sent', 'wallet_transfer_received');

CREATE OR REPLACE FUNCTION pos.mask_customer_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pos, public
AS $$
  SELECT CASE
    WHEN regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') = '' THEN NULL
    WHEN length(regexp_replace(p_phone, '[^0-9]', '', 'g')) <= 6 THEN '••••'
    ELSE left(regexp_replace(p_phone, '[^0-9]', '', 'g'), 2)
      || '••••••'
      || right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 4)
  END
$$;

CREATE OR REPLACE FUNCTION pos.wallet_transactions_for_customer(
  p_customer_id text,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  transfer_id text,
  direction text,
  category text,
  type text,
  amount bigint,
  balance_after bigint,
  status text,
  counterparty_name text,
  counterparty_phone text,
  reference_type text,
  reference_id text,
  note text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pos, public
AS $$
  SELECT
    l.id,
    CASE WHEN l.reference_type = 'wallet_transfer' THEN l.reference_id ELSE NULL END AS transfer_id,
    l.direction,
    CASE
      WHEN l.transaction_type IN ('wallet_transfer_sent', 'wallet_transfer_received') THEN 'transfer'
      WHEN l.transaction_type LIKE 'topup_%' THEN 'topup'
      WHEN l.transaction_type IN ('order_debit', 'wallet_hold', 'wallet_capture') THEN 'payment'
      WHEN l.transaction_type IN ('refund', 'wallet_release') THEN 'refund'
      ELSE 'adjustment'
    END AS category,
    l.transaction_type AS type,
    l.amount,
    l.balance_after,
    l.status,
    cp.name AS counterparty_name,
    pos.mask_customer_phone(cp.phone) AS counterparty_phone,
    l.reference_type,
    l.reference_id,
    l.note,
    l.created_at
  FROM pos.customer_wallet_ledger l
  LEFT JOIN LATERAL (
    SELECT c.name, c.phone
    FROM pos.customer_wallet_ledger other
    JOIN pos.customers c ON c.source_id = other.customer_id
    WHERE l.reference_type = 'wallet_transfer'
      AND other.reference_type = 'wallet_transfer'
      AND other.reference_id = l.reference_id
      AND other.customer_id <> l.customer_id
    ORDER BY other.id
    LIMIT 1
  ) cp ON true
  WHERE l.customer_id = p_customer_id
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION pos.mask_customer_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pos.wallet_transactions_for_customer(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.mask_customer_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.wallet_transactions_for_customer(text, integer, integer) TO service_role;

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
  v_sender_customer pos.customers;
  v_recipient_customer pos.customers;
  v_transfer_id text := 'wtx_' || md5(trim(p_sender_customer_id) || ':' || trim(p_recipient_customer_id) || ':' || trim(p_idempotency_key));
  v_sender_balance bigint;
  v_recipient_balance bigint;
  v_now timestamptz := now();
BEGIN
  IF coalesce(trim(p_sender_customer_id), '') = '' OR coalesce(trim(p_recipient_customer_id), '') = '' THEN RAISE EXCEPTION 'Pengirim dan penerima wajib diisi'; END IF;
  IF trim(p_sender_customer_id) = trim(p_recipient_customer_id) THEN RAISE EXCEPTION 'Wallet pengirim dan penerima harus berbeda'; END IF;
  IF p_amount < 1000 OR p_amount > 10000000 THEN RAISE EXCEPTION 'Nominal transfer harus Rp1.000 sampai Rp10.000.000'; END IF;
  IF coalesce(trim(p_idempotency_key), '') = '' THEN RAISE EXCEPTION 'Idempotency key wajib diisi'; END IF;
  IF EXISTS (SELECT 1 FROM pos.customer_wallet_ledger WHERE idempotency_key = trim(p_idempotency_key) || ':sent') THEN
    SELECT available_balance INTO v_sender_balance FROM pos.customer_wallets WHERE customer_id = trim(p_sender_customer_id);
    SELECT available_balance INTO v_recipient_balance FROM pos.customer_wallets WHERE customer_id = trim(p_recipient_customer_id);
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'status', 'completed', 'transfer_id', v_transfer_id, 'sender_balance', v_sender_balance, 'recipient_balance', v_recipient_balance);
  END IF;

  PERFORM pos.wallet_ensure(trim(p_sender_customer_id));
  PERFORM pos.wallet_ensure(trim(p_recipient_customer_id));
  SELECT * INTO v_sender_customer FROM pos.customers WHERE source_id = trim(p_sender_customer_id) AND is_active = true;
  SELECT * INTO v_recipient_customer FROM pos.customers WHERE source_id = trim(p_recipient_customer_id) AND is_active = true;
  IF v_sender_customer.source_id IS NULL OR v_recipient_customer.source_id IS NULL THEN RAISE EXCEPTION 'Customer transfer tidak ditemukan'; END IF;

  IF trim(p_sender_customer_id) < trim(p_recipient_customer_id) THEN
    SELECT * INTO v_sender FROM pos.customer_wallets WHERE customer_id = trim(p_sender_customer_id) FOR UPDATE;
    SELECT * INTO v_recipient FROM pos.customer_wallets WHERE customer_id = trim(p_recipient_customer_id) FOR UPDATE;
  ELSE
    SELECT * INTO v_recipient FROM pos.customer_wallets WHERE customer_id = trim(p_recipient_customer_id) FOR UPDATE;
    SELECT * INTO v_sender FROM pos.customer_wallets WHERE customer_id = trim(p_sender_customer_id) FOR UPDATE;
  END IF;
  IF v_sender.status <> 'active' OR v_recipient.status <> 'active' THEN RAISE EXCEPTION 'Wallet pengirim atau penerima tidak aktif'; END IF;
  IF v_sender.available_balance < p_amount THEN RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_BALANCE', 'available_balance', v_sender.available_balance, 'required', p_amount); END IF;

  v_sender_balance := v_sender.available_balance - p_amount;
  v_recipient_balance := v_recipient.available_balance + p_amount;
  UPDATE pos.customer_wallets SET available_balance = v_sender_balance, total_debited = total_debited + p_amount, updated_at = v_now WHERE customer_id = trim(p_sender_customer_id);
  UPDATE pos.customer_wallets SET available_balance = v_recipient_balance, total_credited = total_credited + p_amount, updated_at = v_now WHERE customer_id = trim(p_recipient_customer_id);
  INSERT INTO pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type, reference_type, reference_id, idempotency_key, note)
  VALUES (trim(p_sender_customer_id), p_amount, 'debit', v_sender_balance, 'completed', 'wallet_transfer_sent', 'wallet_transfer', v_transfer_id, trim(p_idempotency_key) || ':sent', coalesce(nullif(trim(p_note), ''), 'Transfer saldo Djiwa Pay'));
  INSERT INTO pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type, reference_type, reference_id, idempotency_key, note)
  VALUES (trim(p_recipient_customer_id), p_amount, 'credit', v_recipient_balance, 'completed', 'wallet_transfer_received', 'wallet_transfer', v_transfer_id, trim(p_idempotency_key) || ':received', 'Transfer saldo Djiwa Pay');

  INSERT INTO public.pos_notifications(notification_type, priority, title, message, target_user_id, dedupe_key, action_type, action_payload, created_by, created_at, is_active)
  VALUES
    ('wallet_transfer_sent', 'normal', 'Saldo berhasil dikirim', format('Saldo %s berhasil dikirim ke %s.', 'Rp' || to_char(p_amount, 'FM999G999G999G999'), coalesce(v_recipient_customer.name, 'Customer Djiwa')), trim(p_sender_customer_id), 'wallet-transfer:' || v_transfer_id || ':sent', 'open_wallet_transaction', jsonb_build_object('transferId', v_transfer_id), trim(p_sender_customer_id), v_now, true),
    ('wallet_transfer_received', 'normal', 'Saldo masuk', format('Kamu menerima %s dari %s.', 'Rp' || to_char(p_amount, 'FM999G999G999G999'), coalesce(v_sender_customer.name, 'Customer Djiwa')), trim(p_recipient_customer_id), 'wallet-transfer:' || v_transfer_id || ':received', 'open_wallet_transaction', jsonb_build_object('transferId', v_transfer_id), trim(p_sender_customer_id), v_now, true)
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'dedup', false, 'status', 'completed', 'transfer_id', v_transfer_id, 'amount', p_amount, 'sender_balance', v_sender_balance, 'recipient_balance', v_recipient_balance);
END;
$$;

REVOKE ALL ON FUNCTION pos.wallet_transfer(text, text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.wallet_transfer(text, text, bigint, text, text) TO service_role;
