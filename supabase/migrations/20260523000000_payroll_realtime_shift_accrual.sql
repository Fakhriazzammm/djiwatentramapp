-- ============================================================
-- Payroll Realtime Shift Accrual
-- Trigger on legacy_mirror.documents for check_out events
-- Project: xaemykhjpkgypqqpfdcb
-- Date: 2026-05-23
-- ============================================================

-- 1. Fungsi trigger: payroll_accrual_on_check_out
CREATE OR REPLACE FUNCTION pos.payroll_accrual_on_check_out()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id         TEXT;
  v_user_name       TEXT;
  v_role_name       TEXT;
  v_user_slug       TEXT;
  v_period_name     TEXT;
  v_period_id       UUID;
  v_run_id          UUID;
  v_staff           RECORD;
  v_day_count       BIGINT;
  v_shift_count     BIGINT;
  v_new_shift_pay   NUMERIC(15,2);
  v_new_allowance   NUMERIC(15,2);
  v_new_gross       NUMERIC(15,2);
  v_new_net         NUMERIC(15,2);
  v_existing_status TEXT;
BEGIN
  -- Guard: hanya attendance check_out
  IF NEW.table_name != 'attendance' THEN RETURN NEW; END IF;
  IF NEW.document->>'type' != 'check_out' THEN RETURN NEW; END IF;

  v_user_id := NEW.document->>'userId';
  IF v_user_id IS NULL OR v_user_id = '' THEN RETURN NEW; END IF;

  -- Ambil data staff + role rules dari active view
  SELECT * INTO v_staff
  FROM pos.pos_payroll_staff_active_view
  WHERE user_id = v_user_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Format periode: "Mei 2026"
  v_period_name := trim(to_char(NOW(), 'FMMonth')) || ' ' || to_char(NOW(), 'YYYY');

  -- Cari/create payroll_period
  SELECT id INTO v_period_id
  FROM pos.payroll_periods
  WHERE period_name = v_period_name
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO pos.payroll_periods (period_name, start_date, end_date, status)
    VALUES (
      v_period_name,
      date_trunc('month', NOW())::date,
      (date_trunc('month', NOW()) + interval '1 month' - interval '1 day')::date,
      'open'
    )
    RETURNING id INTO v_period_id;
  END IF;

  -- Cari/create payroll_run untuk periode ini
  SELECT id INTO v_run_id
  FROM pos.payroll_runs
  WHERE payroll_period_id = v_period_id
  ORDER BY run_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO pos.payroll_runs (payroll_period_id, status)
    VALUES (v_period_id, 'processing')
    RETURNING id INTO v_run_id;
  END IF;

  -- Hitung attendance user untuk periode ini
  SELECT
    COUNT(DISTINCT date(to_timestamp(
      (d.document->>'timestamp')::numeric / 1000
    ))),
    COUNT(DISTINCT d.document_id)
  INTO v_day_count, v_shift_count
  FROM legacy_mirror.documents d
  WHERE d.table_name = 'attendance'
    AND d.document->>'type' = 'check_in'
    AND d.document->>'userId' = v_user_id
    AND date(to_timestamp(
          (d.document->>'timestamp')::numeric / 1000
        )) BETWEEN
          (SELECT start_date FROM pos.payroll_periods WHERE id = v_period_id)
        AND
          (SELECT end_date FROM pos.payroll_periods WHERE id = v_period_id);

  -- Hitung kompensasi
  v_new_shift_pay := COALESCE(v_shift_count, 0) * v_staff.base_shift_rate;
  v_new_allowance := COALESCE(v_day_count, 0) * v_staff.daily_allowance;
  v_new_gross := v_staff.monthly_fixed_salary + v_new_shift_pay + v_new_allowance;
  v_new_net := v_new_gross;

  -- Cek apakah payslip sudah dikirim — LOCK: skip auto-update
  SELECT ps.status INTO v_existing_status
  FROM pos.payslips ps
  JOIN pos.payroll_run_items ri ON ri.id = ps.payroll_run_item_id
  WHERE ri.payroll_run_id = v_run_id AND ri.user_id = v_user_id
  LIMIT 1;

  IF v_existing_status IN ('sent', 'acknowledged', 'disputed') THEN
    RETURN NEW;
  END IF;

  -- Ambil user_name dan role_name
  SELECT name, slug INTO v_user_name, v_user_slug
  FROM public.pos_staff_users
  WHERE _id = v_user_id
  LIMIT 1;

  SELECT r.name INTO v_role_name
  FROM public.pos_staff_roles r
  JOIN public.pos_staff_users u ON u."roleId" = r._id
  WHERE u._id = v_user_id
  LIMIT 1;

  -- UPSERT payroll_run_items
  INSERT INTO pos.payroll_run_items (
    payroll_run_id, user_id, user_name, role_name, role_rule_id,
    total_shifts, attendance_days,
    shift_pay, fixed_salary, daily_allowance_total,
    overtime_pay, bonus_pay,
    gross_pay, deductions, net_pay,
    compensation_breakdown
  ) VALUES (
    v_run_id,
    v_user_id,
    v_user_name,
    v_role_name,
    v_staff.active_role_rule_id,
    COALESCE(v_shift_count, 0),
    COALESCE(v_day_count, 0),
    v_new_shift_pay,
    v_staff.monthly_fixed_salary,
    v_new_allowance,
    0, 0,
    v_new_gross, 0, v_new_net,
    jsonb_build_object(
      'role_name', v_staff.role_name,
      'base_shift_rate', v_staff.base_shift_rate,
      'monthly_fixed_salary', v_staff.monthly_fixed_salary,
      'daily_allowance', v_staff.daily_allowance,
      'overtime_rate_per_hour', v_staff.overtime_rate_per_hour,
      'shifts', COALESCE(v_shift_count, 0),
      'days_worked', COALESCE(v_day_count, 0),
      'total_shift_pay', v_new_shift_pay,
      'total_allowance', v_new_allowance,
      'total_overtime_bonus', 0,
      'total_penalty', 0,
      'bonus_target', '{}'::jsonb
    )
  )
  ON CONFLICT (payroll_run_id, user_id) DO UPDATE SET
    total_shifts     = COALESCE(v_shift_count, 0),
    attendance_days  = COALESCE(v_day_count, 0),
    shift_pay        = v_new_shift_pay,
    daily_allowance_total = v_new_allowance,
    gross_pay        = v_new_gross,
    net_pay          = v_new_net,
    compensation_breakdown = EXCLUDED.compensation_breakdown,
    updated_at       = NOW();

  -- UPSERT payslip
  INSERT INTO pos.payslips (
    payroll_run_item_id, user_id, user_name, slug,
    period_name, period_start, period_end,
    gross_pay, deductions, net_pay, breakdown, status
  )
  SELECT
    ri.id,
    ri.user_id, ri.user_name,
    v_user_slug,
    pp.period_name, pp.start_date, pp.end_date,
    ri.gross_pay, ri.deductions, ri.net_pay,
    ri.compensation_breakdown,
    'generated'
  FROM pos.payroll_run_items ri
  JOIN pos.payroll_runs pr ON pr.id = ri.payroll_run_id
  JOIN pos.payroll_periods pp ON pp.id = pr.payroll_period_id
  WHERE ri.payroll_run_id = v_run_id AND ri.user_id = v_user_id
  ON CONFLICT (payroll_run_item_id) DO UPDATE SET
    gross_pay   = EXCLUDED.gross_pay,
    deductions  = EXCLUDED.deductions,
    net_pay     = EXCLUDED.net_pay,
    breakdown   = EXCLUDED.breakdown,
    slug        = EXCLUDED.slug,
    updated_at  = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Pasang trigger pada legacy_mirror.documents
DROP TRIGGER IF EXISTS payroll_shift_accrual ON legacy_mirror.documents;
CREATE TRIGGER payroll_shift_accrual
  AFTER INSERT ON legacy_mirror.documents
  FOR EACH ROW
  EXECUTE FUNCTION pos.payroll_accrual_on_check_out();

-- 3. Update run totals setelah insert/update run_items
CREATE OR REPLACE FUNCTION pos.payroll_update_run_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE pos.payroll_runs
  SET
    total_employees = (SELECT count(*) FROM pos.payroll_run_items WHERE payroll_run_id = NEW.payroll_run_id),
    total_gross_pay = (SELECT COALESCE(sum(gross_pay), 0) FROM pos.payroll_run_items WHERE payroll_run_id = NEW.payroll_run_id),
    total_net_pay   = (SELECT COALESCE(sum(net_pay), 0) FROM pos.payroll_run_items WHERE payroll_run_id = NEW.payroll_run_id)
  WHERE id = NEW.payroll_run_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payroll_run_items_update_totals ON pos.payroll_run_items;
CREATE TRIGGER payroll_run_items_update_totals
  AFTER INSERT OR UPDATE ON pos.payroll_run_items
  FOR EACH ROW
  EXECUTE FUNCTION pos.payroll_update_run_totals();

COMMENT ON FUNCTION pos.payroll_accrual_on_check_out() IS
  'Realtime payroll accrual: setiap check_out, hitung ulang attendance user untuk bulan berjalan, upsert run_item + payslip. Skip jika payslip sudah sent/acknowledged/disputed.';
