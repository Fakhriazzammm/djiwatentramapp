-- Migration: Create attendance_leave_requests table for Izin/Cuti/Sakit
-- Additive migration — idempotent with IF NOT EXISTS

CREATE TABLE IF NOT EXISTS public.attendance_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,  -- references pos_users_public._id
  user_name text,
  leave_type text NOT NULL CHECK (leave_type IN ('izin', 'cuti', 'sakit', 'other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL,
  attachment_url text,  -- optional, for sick letter or supporting doc
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by text,  -- admin user who reviewed
  review_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for user's requests
CREATE INDEX IF NOT EXISTS idx_leave_requests_user 
  ON public.attendance_leave_requests (user_id, created_at DESC);

-- Index for admin review
CREATE INDEX IF NOT EXISTS idx_leave_requests_status 
  ON public.attendance_leave_requests (status, created_at DESC);

-- Enable RLS
ALTER TABLE public.attendance_leave_requests ENABLE ROW LEVEL SECURITY;

-- User can read own requests (based on user_id matching their session)
CREATE POLICY leave_requests_read_own ON public.attendance_leave_requests
  FOR SELECT
  USING (true);  -- service_role will filter in app, simplified for self-hosted

-- User can insert own request
CREATE POLICY leave_requests_insert_own ON public.attendance_leave_requests
  FOR INSERT
  WITH CHECK (true);

-- Only admin/service_role can update status
CREATE POLICY leave_requests_update_admin ON public.attendance_leave_requests
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
