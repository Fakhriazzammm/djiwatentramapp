-- ============================================================
-- Additive recruitment workflow schema
-- Existing recruitment tables and candidate data are not modified.
-- ============================================================

-- 1. Interviews
CREATE TABLE IF NOT EXISTS pos.recruitment_interviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id        UUID NOT NULL REFERENCES pos.recruitment_candidates(id),
    scheduled_at        TIMESTAMPTZ,
    timezone            TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    interviewer_user_id UUID,
    location            TEXT,
    meeting_url         TEXT,
    status              TEXT NOT NULL DEFAULT 'Scheduled'
                        CHECK (status IN ('Scheduled', 'Rescheduled', 'Completed', 'Passed', 'Failed', 'Cancelled')),
    notes               TEXT,
    feedback            TEXT,
    result              TEXT,
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_candidate
    ON pos.recruitment_interviews(candidate_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_status
    ON pos.recruitment_interviews(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_interviewer
    ON pos.recruitment_interviews(interviewer_user_id, scheduled_at);

-- 2. Candidate status history
CREATE TABLE IF NOT EXISTS pos.recruitment_candidate_status_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id        UUID NOT NULL REFERENCES pos.recruitment_candidates(id),
    from_status         TEXT,
    to_status           TEXT NOT NULL,
    note                TEXT,
    changed_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recruitment_status_history_candidate
    ON pos.recruitment_candidate_status_history(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_status_history_to_status
    ON pos.recruitment_candidate_status_history(to_status, created_at DESC);

-- 3. Onboarding tasks
CREATE TABLE IF NOT EXISTS pos.recruitment_onboarding_tasks (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id                UUID NOT NULL REFERENCES pos.recruitment_candidates(id),
    onboarding_application_id   UUID REFERENCES public.employee_onboarding_applications(id),
    task_key                    TEXT NOT NULL,
    label                       TEXT NOT NULL,
    status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'cancelled')),
    due_date                    DATE,
    completed_at                TIMESTAMPTZ,
    completed_by                UUID,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recruitment_onboarding_tasks_candidate
    ON pos.recruitment_onboarding_tasks(candidate_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_recruitment_onboarding_tasks_application
    ON pos.recruitment_onboarding_tasks(onboarding_application_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_recruitment_onboarding_tasks_status
    ON pos.recruitment_onboarding_tasks(status, due_date);

-- 4. Recruitment audit logs
CREATE TABLE IF NOT EXISTS pos.recruitment_audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type         TEXT NOT NULL
                        CHECK (entity_type IN ('candidate', 'interview', 'status_history', 'onboarding_task', 'onboarding_application')),
    entity_id           UUID,
    action              TEXT NOT NULL,
    actor_user_id       UUID,
    before_data         JSONB,
    after_data          JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recruitment_audit_logs_entity
    ON pos.recruitment_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_audit_logs_actor
    ON pos.recruitment_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_audit_logs_action
    ON pos.recruitment_audit_logs(action, created_at DESC);

-- RLS follows the existing internal-schema convention:
-- service_role manages records; authenticated users may read them.
ALTER TABLE pos.recruitment_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.recruitment_candidate_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.recruitment_onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.recruitment_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pos' AND tablename = 'recruitment_interviews' AND policyname = 'Service role full access on recruitment_interviews') THEN
        CREATE POLICY "Service role full access on recruitment_interviews" ON pos.recruitment_interviews FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pos' AND tablename = 'recruitment_interviews' AND policyname = 'Authenticated read access on recruitment_interviews') THEN
        CREATE POLICY "Authenticated read access on recruitment_interviews" ON pos.recruitment_interviews FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pos' AND tablename = 'recruitment_candidate_status_history' AND policyname = 'recruitment_status_history_service_all') THEN
        CREATE POLICY recruitment_status_history_service_all ON pos.recruitment_candidate_status_history FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pos' AND tablename = 'recruitment_candidate_status_history' AND policyname = 'recruitment_status_history_auth_read') THEN
        CREATE POLICY recruitment_status_history_auth_read ON pos.recruitment_candidate_status_history FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pos' AND tablename = 'recruitment_onboarding_tasks' AND policyname = 'Service role full access on recruitment_onboarding_tasks') THEN
        CREATE POLICY "Service role full access on recruitment_onboarding_tasks" ON pos.recruitment_onboarding_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pos' AND tablename = 'recruitment_onboarding_tasks' AND policyname = 'Authenticated read access on recruitment_onboarding_tasks') THEN
        CREATE POLICY "Authenticated read access on recruitment_onboarding_tasks" ON pos.recruitment_onboarding_tasks FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pos' AND tablename = 'recruitment_audit_logs' AND policyname = 'Service role full access on recruitment_audit_logs') THEN
        CREATE POLICY "Service role full access on recruitment_audit_logs" ON pos.recruitment_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'pos' AND tablename = 'recruitment_audit_logs' AND policyname = 'Authenticated read access on recruitment_audit_logs') THEN
        CREATE POLICY "Authenticated read access on recruitment_audit_logs" ON pos.recruitment_audit_logs FOR SELECT TO authenticated USING (true);
    END IF;
END
$$;
