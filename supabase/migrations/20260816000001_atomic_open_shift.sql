-- Atomic cashier opening with database-level integrity and idempotency.
-- Existing rows are preserved; all changes are additive.

ALTER TABLE pos.shifts
  ADD COLUMN IF NOT EXISTS cashier_user_id TEXT,
  ADD COLUMN IF NOT EXISTS team_member_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS opened_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS open_request_id TEXT;

ALTER TABLE pos.shifts
  DROP CONSTRAINT IF EXISTS shifts_starting_cash_nonnegative;
ALTER TABLE pos.shifts
  ADD CONSTRAINT shifts_starting_cash_nonnegative CHECK (starting_cash >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_shifts_one_active
  ON pos.shifts ((true))
  WHERE end_time IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_shifts_open_request_id
  ON pos.shifts (open_request_id)
  WHERE open_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION pos.open_shift_atomic(
  p_source_id TEXT,
  p_transaction_id TEXT,
  p_shift_name TEXT,
  p_cashier_name TEXT,
  p_cashier_user_id TEXT,
  p_team_members TEXT,
  p_team_member_ids JSONB,
  p_starting_cash NUMERIC,
  p_notes TEXT,
  p_opened_by_user_id TEXT,
  p_open_request_id TEXT,
  p_start_time DOUBLE PRECISION,
  p_raw JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pos
AS $$
DECLARE
  v_active pos.shifts%ROWTYPE;
  v_existing pos.shifts%ROWTYPE;
  v_raw JSONB := COALESCE(p_raw, '{}'::jsonb);
  v_team_ids JSONB := CASE
    WHEN jsonb_typeof(COALESCE(p_team_member_ids, '[]'::jsonb)) = 'array'
      THEN COALESCE(p_team_member_ids, '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
BEGIN
  IF NULLIF(btrim(p_source_id), '') IS NULL
     OR NULLIF(btrim(p_transaction_id), '') IS NULL
     OR NULLIF(btrim(p_open_request_id), '') IS NULL THEN
    RAISE EXCEPTION 'ID pembukaan shift tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(p_shift_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama shift wajib diisi' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(p_cashier_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama kasir wajib diisi' USING ERRCODE = '22023';
  END IF;

  IF p_starting_cash IS NULL OR p_starting_cash < 0 OR p_starting_cash <> p_starting_cash THEN
    RAISE EXCEPTION 'Modal kasir tidak valid' USING ERRCODE = '22023';
  END IF;

  -- Same lock key is used for every opening request, so the check and inserts
  -- cannot race even when two devices submit at the same time.
  PERFORM pg_advisory_xact_lock(hashtext('pos:active-shift'));

  SELECT * INTO v_existing
  FROM pos.shifts
  WHERE open_request_id = p_open_request_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'shift_id', v_existing.source_id,
      'transaction_id', (
        SELECT ft.source_id
        FROM pos.financial_transactions ft
        WHERE ft.raw->>'shiftId' = v_existing.source_id
          AND ft.raw->>'kind' = 'shift_open'
        ORDER BY ft.creation_time DESC NULLS LAST
        LIMIT 1
      )
    );
  END IF;

  SELECT * INTO v_active
  FROM pos.shifts
  WHERE end_time IS NULL
  ORDER BY start_time DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Shift masih berjalan: % oleh %. Tutup shift aktif terlebih dahulu sebelum membuka shift baru.',
      v_active.shift_name, COALESCE(v_active.cashier_name, '?')
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO pos.shifts (
    source_id, shift_name, cashier_name, cashier_user_id, team_members,
    team_member_ids, start_time, starting_cash, notes, creation_time,
    open_request_id, opened_by_user_id, raw
  ) VALUES (
    p_source_id,
    btrim(p_shift_name),
    btrim(p_cashier_name),
    NULLIF(btrim(p_cashier_user_id), ''),
    NULLIF(btrim(p_team_members), ''),
    v_team_ids,
    p_start_time,
    p_starting_cash,
    NULLIF(p_notes, ''),
    p_start_time,
    p_open_request_id,
    NULLIF(btrim(p_opened_by_user_id), ''),
    v_raw || jsonb_build_object(
      'opening', jsonb_build_object(
        'cashierUserId', NULLIF(btrim(p_cashier_user_id), ''),
        'teamMemberIds', v_team_ids,
        'openedByUserId', NULLIF(btrim(p_opened_by_user_id), ''),
        'openRequestId', p_open_request_id,
        'transactionId', p_transaction_id
      )
    )
  );

  INSERT INTO pos.financial_transactions (
    source_id, tx_type, amount, category, description, tx_date,
    status, payment_method, metadata, creation_time, raw
  ) VALUES (
    p_transaction_id,
    'income',
    p_starting_cash,
    'Modal Awal',
    concat(
      'Kasir: ', btrim(p_cashier_name),
      ' | Shift: ', btrim(p_shift_name),
      CASE WHEN NULLIF(btrim(p_team_members), '') IS NULL THEN '' ELSE concat(' | Tim: ', p_team_members) END,
      CASE WHEN NULLIF(p_notes, '') IS NULL THEN '' ELSE concat(' | Catatan: ', p_notes) END
    ),
    p_start_time,
    'completed',
    'tunai',
    jsonb_build_object(
      'source', 'shift_open',
      'sourceLabel', 'Shift Open',
      'openRequestId', p_open_request_id,
      'openedByUserId', NULLIF(btrim(p_opened_by_user_id), ''),
      'cashierUserId', NULLIF(btrim(p_cashier_user_id), ''),
      'teamMemberIds', v_team_ids
    ),
    p_start_time,
    jsonb_build_object(
      'shiftId', p_source_id,
      'kind', 'shift_open',
      'openRequestId', p_open_request_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'shift_id', p_source_id,
    'transaction_id', p_transaction_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pos.open_shift_atomic(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT, TEXT, TEXT, DOUBLE PRECISION, JSONB
) TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.pos_shifts
WITH (security_invoker = true) AS
SELECT
  source_id AS _id,
  shift_name AS "shiftName",
  cashier_name AS "cashierName",
  team_members AS "teamMembers",
  start_time AS "startTime",
  end_time AS "endTime",
  starting_cash AS "startingCash",
  notes,
  summary,
  cash_breakdown AS "cashBreakdown",
  non_cash_expected AS "nonCashExpected",
  non_cash_confirmed AS "nonCashConfirmed",
  ending_cash_expected AS "endingCashExpected",
  ending_cash_physical AS "endingCashPhysical",
  raw,
  cashier_user_id AS "cashierUserId",
  team_member_ids AS "teamMemberIds",
  opened_by_user_id AS "openedByUserId",
  open_request_id AS "openRequestId"
FROM pos.shifts;

GRANT SELECT ON public.pos_shifts TO anon, authenticated, service_role;
