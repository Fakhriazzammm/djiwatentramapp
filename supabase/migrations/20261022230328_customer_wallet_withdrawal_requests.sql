-- Safe withdrawal request queue.
-- Creating a request does not debit or hold the wallet. Settlement requires a
-- separate trusted admin/provider workflow that is not present yet.

CREATE TABLE IF NOT EXISTS pos.customer_wallet_withdrawal_requests (
  request_id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  amount bigint NOT NULL CHECK (amount >= 10000 AND amount <= 10000000),
  bank_name text NOT NULL CHECK (length(btrim(bank_name)) BETWEEN 2 AND 80),
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{6,30}$'),
  account_name text NOT NULL CHECK (length(btrim(account_name)) BETWEEN 2 AND 120),
  note text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'paid', 'cancelled')),
  idempotency_key text NOT NULL UNIQUE,
  source_app text NOT NULL DEFAULT 'djiwapay',
  requested_balance bigint NOT NULL CHECK (requested_balance >= 0),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_customer_wallet_withdrawal_customer_created
  ON pos.customer_wallet_withdrawal_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_wallet_withdrawal_status
  ON pos.customer_wallet_withdrawal_requests(status, created_at ASC);

CREATE OR REPLACE FUNCTION pos.wallet_create_withdrawal_request(
  p_customer_id text,
  p_amount bigint,
  p_bank_name text,
  p_account_number text,
  p_account_name text,
  p_note text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_wallet pos.customer_wallets;
  v_existing pos.customer_wallet_withdrawal_requests;
  v_request_id text := 'wdr_' || replace(gen_random_uuid()::text, '-', '');
  v_bank text := btrim(p_bank_name);
  v_account text := btrim(p_account_number);
  v_name text := btrim(p_account_name);
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 120), '');
BEGIN
  IF coalesce(btrim(p_customer_id), '') = '' OR coalesce(btrim(p_idempotency_key), '') = '' THEN RAISE EXCEPTION 'Customer dan idempotency key wajib diisi'; END IF;
  IF p_amount < 10000 OR p_amount > 10000000 THEN RAISE EXCEPTION 'Nominal withdrawal tidak valid'; END IF;
  IF length(v_bank) NOT BETWEEN 2 AND 80 OR v_account !~ '^[0-9]{6,30}$' OR length(v_name) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Data rekening tidak valid'; END IF;
  SELECT * INTO v_existing FROM pos.customer_wallet_withdrawal_requests WHERE idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'dedup', true, 'request_id', v_existing.request_id, 'status', v_existing.status, 'amount', v_existing.amount); END IF;

  PERFORM pos.wallet_ensure(btrim(p_customer_id));
  SELECT * INTO v_wallet FROM pos.customer_wallets WHERE customer_id = btrim(p_customer_id) FOR UPDATE;
  IF v_wallet.status <> 'active' THEN RAISE EXCEPTION 'Wallet customer sedang diblokir'; END IF;
  IF v_wallet.available_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_BALANCE', 'available_balance', v_wallet.available_balance, 'required', p_amount);
  END IF;

  INSERT INTO pos.customer_wallet_withdrawal_requests(request_id, customer_id, amount, bank_name, account_number, account_name, note, idempotency_key, requested_balance)
  VALUES (v_request_id, btrim(p_customer_id), p_amount, v_bank, v_account, v_name, v_note, btrim(p_idempotency_key), v_wallet.available_balance);
  RETURN jsonb_build_object('ok', true, 'dedup', false, 'request_id', v_request_id, 'status', 'pending_review', 'amount', p_amount, 'requested_balance', v_wallet.available_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION pos.wallet_create_withdrawal_request(text, bigint, text, text, text, text, text) TO service_role;

