-- Payroll public views for Supabase client access (pos schema -> public)
-- Run: Supabase Management API or psql

CREATE OR REPLACE VIEW public.pos_payroll_periods AS SELECT * FROM pos.payroll_periods;
CREATE OR REPLACE VIEW public.pos_payroll_runs AS SELECT * FROM pos.payroll_runs;
CREATE OR REPLACE VIEW public.pos_payroll_run_items AS SELECT * FROM pos.payroll_run_items;
CREATE OR REPLACE VIEW public.pos_payslips AS SELECT * FROM pos.payslips;
CREATE OR REPLACE VIEW public.pos_payroll_audit_logs AS SELECT * FROM pos.payroll_audit_logs;
CREATE OR REPLACE VIEW public.pos_payroll_role_rules AS SELECT * FROM pos.payroll_role_rules;
CREATE OR REPLACE VIEW public.pos_payroll_user_overrides AS SELECT * FROM pos.payroll_user_overrides;
CREATE OR REPLACE VIEW public.pos_payroll_staff_active_view AS SELECT * FROM pos.pos_payroll_staff_active_view;
CREATE OR REPLACE VIEW public.pos_attendance_payroll_summary_view AS SELECT * FROM pos.pos_attendance_payroll_summary_view;
