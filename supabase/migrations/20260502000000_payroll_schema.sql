-- ============================================================
-- Payroll Schema Migration for pos schema
-- Project: xaemykhjpkgypqqpfdcb
-- Date: 2026-05-02
-- Tables: payroll_periods, payroll_runs, payroll_run_items,
--         payslips, payroll_audit_logs, payroll_role_rules,
--         payroll_user_overrides
-- Views:  pos_payroll_staff_active_view,
--         pos_attendance_payroll_summary_view
-- ============================================================

-- ============================================================
-- 1. payroll_periods
-- ============================================================
CREATE TABLE IF NOT EXISTS pos.payroll_periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_name     TEXT NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    cutoff_date     DATE,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','open','processing','closed')),
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata        JSONB DEFAULT '{}',
    CONSTRAINT payroll_periods_date_range CHECK (end_date >= start_date),
    CONSTRAINT payroll_periods_unique_name UNIQUE (period_name)
);

COMMENT ON TABLE pos.payroll_periods IS 'Defines payroll calculation periods (monthly, bi-weekly, etc.)';

-- ============================================================
-- 2. payroll_role_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS pos.payroll_role_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_role_id      TEXT NOT NULL,
    role_name           TEXT NOT NULL,
    base_hourly_rate    NUMERIC(15,2) NOT NULL DEFAULT 0,
    base_shift_rate     NUMERIC(15,2) NOT NULL DEFAULT 0,
    monthly_fixed_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
    daily_allowance     NUMERIC(15,2) NOT NULL DEFAULT 0,
    overtime_rate_per_hour NUMERIC(15,2) NOT NULL DEFAULT 0,
    bonus_target_config JSONB DEFAULT '{}',
    effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to        DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata            JSONB DEFAULT '{}',
    CONSTRAINT payroll_role_rules_unique_active UNIQUE (source_role_id, effective_to)
);

COMMENT ON TABLE pos.payroll_role_rules IS 'Payroll compensation rules per role, seeded from pos_staff_roles.raw fields';

-- ============================================================
-- 3. payroll_user_overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS pos.payroll_user_overrides (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT NOT NULL,
    payroll_period_id   UUID REFERENCES pos.payroll_periods(id),
    base_hourly_rate    NUMERIC(15,2),
    base_shift_rate     NUMERIC(15,2),
    monthly_fixed_salary NUMERIC(15,2),
    daily_allowance     NUMERIC(15,2),
    overtime_rate_per_hour NUMERIC(15,2),
    bonus_override      NUMERIC(15,2),
    notes               TEXT,
    effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to        DATE,
    created_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata            JSONB DEFAULT '{}'
);

COMMENT ON TABLE pos.payroll_user_overrides IS 'Per-user payroll overrides that take precedence over role defaults';

-- ============================================================
-- 4. payroll_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS pos.payroll_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_period_id   UUID NOT NULL REFERENCES pos.payroll_periods(id),
    run_name            TEXT,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','completed','failed','reversed')),
    total_gross_pay     NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_deductions    NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_net_pay       NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_employees     INTEGER NOT NULL DEFAULT 0,
    run_date            TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    created_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata            JSONB DEFAULT '{}'
);

COMMENT ON TABLE pos.payroll_runs IS 'Individual payroll calculation runs within a period';

-- ============================================================
-- 5. payroll_run_items
-- ============================================================
CREATE TABLE IF NOT EXISTS pos.payroll_run_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id      UUID NOT NULL REFERENCES pos.payroll_runs(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL,
    user_name           TEXT,
    role_name           TEXT,
    role_rule_id        UUID REFERENCES pos.payroll_role_rules(id),
    user_override_id    UUID REFERENCES pos.payroll_user_overrides(id),
    -- Attendance breakdown
    total_shifts        INTEGER NOT NULL DEFAULT 0,
    total_hours         NUMERIC(8,2) NOT NULL DEFAULT 0,
    overtime_hours      NUMERIC(8,2) NOT NULL DEFAULT 0,
    attendance_days     INTEGER NOT NULL DEFAULT 0,
    absent_days         INTEGER NOT NULL DEFAULT 0,
    -- Compensation
    shift_pay           NUMERIC(15,2) NOT NULL DEFAULT 0,
    hourly_pay          NUMERIC(15,2) NOT NULL DEFAULT 0,
    fixed_salary        NUMERIC(15,2) NOT NULL DEFAULT 0,
    daily_allowance_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    overtime_pay        NUMERIC(15,2) NOT NULL DEFAULT 0,
    bonus_pay           NUMERIC(15,2) NOT NULL DEFAULT 0,
    -- Totals
    gross_pay           NUMERIC(15,2) NOT NULL DEFAULT 0,
    deductions          NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_pay             NUMERIC(15,2) NOT NULL DEFAULT 0,
    -- Breakdown detail
    compensation_breakdown JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payroll_run_items_unique_per_run UNIQUE (payroll_run_id, user_id)
);

COMMENT ON TABLE pos.payroll_run_items IS 'Individual employee line items within a payroll run';

-- ============================================================
-- 6. payslips
-- ============================================================
CREATE TABLE IF NOT EXISTS pos.payslips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_item_id UUID NOT NULL REFERENCES pos.payroll_run_items(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL,
    user_name           TEXT,
    period_name         TEXT,
    period_start        DATE,
    period_end          DATE,
    gross_pay           NUMERIC(15,2) NOT NULL DEFAULT 0,
    deductions          NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_pay             NUMERIC(15,2) NOT NULL DEFAULT 0,
    breakdown           JSONB DEFAULT '{}',
    status              TEXT NOT NULL DEFAULT 'generated'
                        CHECK (status IN ('generated','sent','acknowledged','disputed')),
    sent_at             TIMESTAMPTZ,
    acknowledged_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payslips_unique_per_run_item UNIQUE (payroll_run_item_id)
);

COMMENT ON TABLE pos.payslips IS 'Generated payslip documents for employees';

-- ============================================================
-- 7. payroll_audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS pos.payroll_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       UUID,
    actor_id        TEXT,
    actor_name      TEXT,
    old_values      JSONB,
    new_values      JSONB,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata        JSONB DEFAULT '{}'
);

COMMENT ON TABLE pos.payroll_audit_logs IS 'Audit trail for all payroll-related changes';

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON pos.payroll_periods(status);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates ON pos.payroll_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_payroll_role_rules_source_role ON pos.payroll_role_rules(source_role_id);
CREATE INDEX IF NOT EXISTS idx_payroll_role_rules_effective ON pos.payroll_role_rules(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_payroll_user_overrides_user ON pos.payroll_user_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_user_overrides_period ON pos.payroll_user_overrides(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON pos.payroll_runs(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON pos.payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_run_items_run ON pos.payroll_run_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_run_items_user ON pos.payroll_run_items(user_id);
CREATE INDEX IF NOT EXISTS idx_payslips_user ON pos.payslips(user_id);
CREATE INDEX IF NOT EXISTS idx_payslips_run_item ON pos.payslips(payroll_run_item_id);
CREATE INDEX IF NOT EXISTS idx_payslips_status ON pos.payslips(status);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_entity ON pos.payroll_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_action ON pos.payroll_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_created ON pos.payroll_audit_logs(created_at);

-- ============================================================
-- Updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION pos.payroll_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER set_updated_at_payroll_periods BEFORE UPDATE ON pos.payroll_periods FOR EACH ROW EXECUTE FUNCTION pos.payroll_set_updated_at();
CREATE TRIGGER set_updated_at_payroll_role_rules BEFORE UPDATE ON pos.payroll_role_rules FOR EACH ROW EXECUTE FUNCTION pos.payroll_set_updated_at();
CREATE TRIGGER set_updated_at_payroll_user_overrides BEFORE UPDATE ON pos.payroll_user_overrides FOR EACH ROW EXECUTE FUNCTION pos.payroll_set_updated_at();
CREATE TRIGGER set_updated_at_payroll_runs BEFORE UPDATE ON pos.payroll_runs FOR EACH ROW EXECUTE FUNCTION pos.payroll_set_updated_at();
CREATE TRIGGER set_updated_at_payroll_run_items BEFORE UPDATE ON pos.payroll_run_items FOR EACH ROW EXECUTE FUNCTION pos.payroll_set_updated_at();
CREATE TRIGGER set_updated_at_payslips BEFORE UPDATE ON pos.payslips FOR EACH ROW EXECUTE FUNCTION pos.payroll_set_updated_at();

-- ============================================================
-- View: pos_payroll_staff_active_view
-- Active staff with current payroll role rules
-- ============================================================
CREATE OR REPLACE VIEW pos.pos_payroll_staff_active_view AS
SELECT
    u._id                                      AS user_id,
    u.username,
    u.name                                     AS user_name,
    u.slug,
    u."roleId"                                 AS role_id,
    u."roleName"                               AS role_name,
    r.name                                     AS role_display_name,
    COALESCE(rr.base_hourly_rate, 0)           AS base_hourly_rate,
    COALESCE(rr.base_shift_rate, 0)            AS base_shift_rate,
    COALESCE(rr.monthly_fixed_salary, 0)       AS monthly_fixed_salary,
    COALESCE(rr.daily_allowance, 0)            AS daily_allowance,
    COALESCE(rr.overtime_rate_per_hour, 0)     AS overtime_rate_per_hour,
    rr.bonus_target_config,
    rr.id                                      AS active_role_rule_id
FROM public.pos_staff_users u
JOIN public.pos_staff_roles r ON u."roleId" = r._id
LEFT JOIN LATERAL (
    SELECT *
    FROM pos.payroll_role_rules rr
    WHERE rr.source_role_id = r._id
      AND rr.effective_from <= CURRENT_DATE
      AND (rr.effective_to IS NULL OR rr.effective_to >= CURRENT_DATE)
    ORDER BY rr.effective_from DESC
    LIMIT 1
) rr ON true
WHERE u."isActive" = true;

COMMENT ON VIEW pos.pos_payroll_staff_active_view IS 'Active staff with their current payroll role rules';

-- ============================================================
-- View: pos_attendance_payroll_summary_view
-- Aggregated attendance per staff for payroll calculations
-- Uses raw->>'timestamp' to handle decimal timestamp values
-- ============================================================
CREATE OR REPLACE VIEW pos.pos_attendance_payroll_summary_view AS
WITH check_ins AS (
    SELECT
        a."userId"       AS user_id,
        a."userName"     AS user_name,
        a."roleName"     AS role_name,
        a."shiftName"    AS shift_name,
        date(to_timestamp(
            (a.raw->>'timestamp')::numeric / 1000
        )) AS attendance_date,
        a._id            AS check_in_id
    FROM public.pos_attendance_logs a
    WHERE a.type = 'check_in'
      AND a.raw->>'timestamp' IS NOT NULL
),
check_outs AS (
    SELECT
        a."userId"       AS user_id,
        date(to_timestamp(
            (a.raw->>'timestamp')::numeric / 1000
        )) AS attendance_date
    FROM public.pos_attendance_logs a
    WHERE a.type = 'check_out'
      AND a.raw->>'timestamp' IS NOT NULL
),
daily_attendance AS (
    SELECT
        ci.user_id,
        ci.user_name,
        ci.role_name,
        ci.attendance_date,
        ci.shift_name,
        COUNT(DISTINCT ci.check_in_id) AS shift_count
    FROM check_ins ci
    LEFT JOIN check_outs co
        ON co.user_id = ci.user_id
        AND co.attendance_date = ci.attendance_date
    GROUP BY ci.user_id, ci.user_name, ci.role_name, ci.attendance_date, ci.shift_name
)
SELECT
    user_id,
    user_name,
    role_name,
    COUNT(*)                                              AS total_days_worked,
    SUM(shift_count)                                      AS total_shifts,
    COUNT(DISTINCT shift_name) FILTER (WHERE shift_name IS NOT NULL)
                                                           AS distinct_shift_types,
    MIN(attendance_date)                                  AS period_start,
    MAX(attendance_date)                                  AS period_end
FROM daily_attendance
GROUP BY user_id, user_name, role_name;

COMMENT ON VIEW pos.pos_attendance_payroll_summary_view IS 'Aggregated attendance summary per staff member for payroll calculations';

-- ============================================================
-- Seed payroll_role_rules from existing pos_staff_roles
-- ============================================================
INSERT INTO pos.payroll_role_rules (
    source_role_id, role_name,
    base_hourly_rate, base_shift_rate, monthly_fixed_salary, daily_allowance,
    overtime_rate_per_hour, bonus_target_config, effective_from
)
SELECT
    r._id,
    r.name,
    COALESCE((r.raw->>'baseHourlyRate')::numeric, 0),
    COALESCE((r.raw->>'baseShiftRate')::numeric, 0),
    COALESCE((r.raw->>'monthlyFixedSalary')::numeric, 0),
    COALESCE((r.raw->>'dailyAllowance')::numeric, 0),
    0,
    COALESCE(r.raw->'bonusTargetConfig', '{}'),
    CURRENT_DATE
FROM public.pos_staff_roles r
WHERE r.raw IS NOT NULL
  AND jsonb_typeof(r.raw) = 'object'
  AND r._id != 'test-role'
ON CONFLICT DO NOTHING;

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE pos.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.payroll_role_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.payroll_user_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.payroll_run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.payroll_audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: service_role full access, authenticated read
-- ============================================================
CREATE POLICY "Service role full access on payroll_periods" ON pos.payroll_periods FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read access on payroll_periods" ON pos.payroll_periods FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access on payroll_role_rules" ON pos.payroll_role_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read access on payroll_role_rules" ON pos.payroll_role_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access on payroll_user_overrides" ON pos.payroll_user_overrides FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read access on payroll_user_overrides" ON pos.payroll_user_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access on payroll_runs" ON pos.payroll_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read access on payroll_runs" ON pos.payroll_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access on payroll_run_items" ON pos.payroll_run_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read access on payroll_run_items" ON pos.payroll_run_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access on payslips" ON pos.payslips FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read access on payslips" ON pos.payslips FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access on payroll_audit_logs" ON pos.payroll_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read access on payroll_audit_logs" ON pos.payroll_audit_logs FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Audit log trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION pos.payroll_audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    action_text TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN action_text := 'INSERT';
    ELSIF TG_OP = 'UPDATE' THEN action_text := 'UPDATE';
    ELSIF TG_OP = 'DELETE' THEN action_text := 'DELETE';
    END IF;

    INSERT INTO pos.payroll_audit_logs (action, entity_type, entity_id, old_values, new_values)
    VALUES (
        action_text,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers
CREATE TRIGGER payroll_runs_audit
    AFTER INSERT OR UPDATE OR DELETE ON pos.payroll_runs
    FOR EACH ROW EXECUTE FUNCTION pos.payroll_audit_trigger_func();

CREATE TRIGGER payroll_run_items_audit
    AFTER INSERT OR UPDATE OR DELETE ON pos.payroll_run_items
    FOR EACH ROW EXECUTE FUNCTION pos.payroll_audit_trigger_func();

CREATE TRIGGER payslips_audit
    AFTER INSERT OR UPDATE OR DELETE ON pos.payslips
    FOR EACH ROW EXECUTE FUNCTION pos.payroll_audit_trigger_func();

-- ============================================================
-- Migration complete
-- ============================================================
