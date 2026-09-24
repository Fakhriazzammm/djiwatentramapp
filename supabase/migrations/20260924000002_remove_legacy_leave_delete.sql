-- Remove the legacy broad delete path. Employee submission/read policies remain
-- temporarily for backward compatibility until their client flow uses leave-admin.
DROP POLICY IF EXISTS leave_requests_delete_admin
  ON public.attendance_leave_requests;
