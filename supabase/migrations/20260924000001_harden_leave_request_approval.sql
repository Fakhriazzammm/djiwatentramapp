-- Harden leave approval boundary without changing existing request history.
CREATE TABLE IF NOT EXISTS public.attendance_leave_request_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.attendance_leave_requests(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  actor_name text,
  action text NOT NULL CHECK (action IN ('approve', 'reject', 'cancel', 'status_update')),
  old_status text,
  new_status text NOT NULL,
  review_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_audit_request
  ON public.attendance_leave_request_audit_logs(request_id, created_at DESC);

ALTER TABLE public.attendance_leave_request_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_leave_request_audit_logs FROM anon, authenticated;
GRANT ALL ON public.attendance_leave_request_audit_logs TO service_role;

-- Remove the misleading public update policy. The protected Edge Function is
-- the only supported approval path; service_role performs the transaction.
DROP POLICY IF EXISTS leave_requests_update_admin ON public.attendance_leave_requests;
DROP POLICY IF EXISTS leave_requests_read_own ON public.attendance_leave_requests;
DROP POLICY IF EXISTS leave_requests_insert_own ON public.attendance_leave_requests;

-- Browser submission remains possible, but only structurally valid pending rows
-- can be inserted. Reads and status writes go through the protected function.
CREATE POLICY leave_requests_insert_pending_valid_user
  ON public.attendance_leave_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND user_id IS NOT NULL
    AND btrim(user_id) <> ''
    AND leave_type IN ('izin', 'cuti', 'sakit', 'other')
    AND start_date <= end_date
  );

CREATE POLICY leave_requests_service_read
  ON public.attendance_leave_requests
  FOR SELECT TO service_role
  USING (true);

CREATE POLICY leave_requests_service_update
  ON public.attendance_leave_requests
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.review_attendance_leave_request(
  p_request_id uuid,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_new_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current attendance_leave_requests%ROWTYPE;
  v_updated attendance_leave_requests%ROWTYPE;
  v_action text;
BEGIN
  IF p_new_status NOT IN ('approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'invalid leave status';
  END IF;
  IF p_actor_id IS NULL OR btrim(p_actor_id) = '' THEN
    RAISE EXCEPTION 'actor is required';
  END IF;
  IF p_review_notes IS NOT NULL AND length(p_review_notes) > 2000 THEN
    RAISE EXCEPTION 'review notes too long';
  END IF;

  SELECT * INTO v_current
  FROM attendance_leave_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'leave request not found';
  END IF;
  IF v_current.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'leave request already processed';
  END IF;

  UPDATE attendance_leave_requests
  SET status = p_new_status,
      reviewed_by = p_actor_id,
      review_notes = NULLIF(btrim(p_review_notes), ''),
      updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_updated;

  v_action := CASE p_new_status
    WHEN 'approved' THEN 'approve'
    WHEN 'rejected' THEN 'reject'
    ELSE 'cancel'
  END;

  INSERT INTO attendance_leave_request_audit_logs (
    request_id, actor_id, actor_name, action, old_status, new_status, review_notes, metadata
  ) VALUES (
    p_request_id, p_actor_id, p_actor_name, v_action, v_current.status,
    v_updated.status, v_updated.review_notes,
    jsonb_build_object('actor_role', p_actor_role)
  );

  RETURN jsonb_build_object(
    'id', v_updated.id,
    'user_id', v_updated.user_id,
    'user_name', v_updated.user_name,
    'leave_type', v_updated.leave_type,
    'start_date', v_updated.start_date,
    'end_date', v_updated.end_date,
    'reason', v_updated.reason,
    'status', v_updated.status,
    'reviewed_by', v_updated.reviewed_by,
    'review_notes', v_updated.review_notes,
    'created_at', v_updated.created_at,
    'updated_at', v_updated.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_attendance_leave_request(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_attendance_leave_request(uuid, text, text, text, text, text) TO service_role;
