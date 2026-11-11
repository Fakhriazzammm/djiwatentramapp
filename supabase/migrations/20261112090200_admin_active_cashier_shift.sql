-- Add current open cashier shift while preserving the existing attendance contract.
CREATE OR REPLACE FUNCTION public.admin_attendance_today(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH staff AS (
    SELECT u._id, u.name, u."roleName"
    FROM public.pos_users_public u
    WHERE COALESCE(u."isActive", true)
  ),
  logs AS (
    SELECT a."userId", a.type, a."timestamp"::double precision AS ts
    FROM public.pos_attendance_logs a
    WHERE a."timestamp" >= p_start
      AND a."timestamp" < p_end
  ),
  last_log AS (
    SELECT DISTINCT ON (l."userId") l."userId", l.type
    FROM logs l
    ORDER BY l."userId", l.ts DESC
  ),
  first_in AS (
    SELECT l."userId", min(l.ts) AS check_in
    FROM logs l
    WHERE l.type = 'check_in'
    GROUP BY l."userId"
  ),
  last_out AS (
    SELECT l."userId", max(l.ts) AS check_out
    FROM logs l
    WHERE l.type = 'check_out'
    GROUP BY l."userId"
  ),
  leave_today AS (
    SELECT DISTINCT ON (lr.user_id) lr.user_id, lr.leave_type
    FROM public.attendance_leave_requests lr
    WHERE lr.status = 'approved'
      AND lr.start_date <= (to_timestamp(p_start / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
      AND lr.end_date >= (to_timestamp(p_start / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
    ORDER BY lr.user_id, lr.start_date DESC
  ),
  staff_rows AS (
    SELECT s._id AS "userId",
           s.name,
           s."roleName" AS role_name,
           CASE
             WHEN ll.type = 'check_in' THEN 'working'
             WHEN fi."userId" IS NOT NULL THEN 'done'
             WHEN lv.user_id IS NOT NULL THEN 'leave'
             ELSE 'absent'
           END AS status,
           fi.check_in AS "checkInAt",
           lo.check_out AS "checkOutAt",
           lv.leave_type AS "leaveType"
    FROM staff s
    LEFT JOIN last_log ll ON ll."userId" = s._id
    LEFT JOIN first_in fi ON fi."userId" = s._id
    LEFT JOIN last_out lo ON lo."userId" = s._id
    LEFT JOIN leave_today lv ON lv.user_id = s._id
  )
  SELECT jsonb_build_object(
    'activeCashierShift', (
      SELECT jsonb_build_object('id', s.source_id, 'shiftName', s.shift_name,
        'cashierName', s.cashier_name, 'startTime', s.start_time)
      FROM pos.shifts s
      WHERE s.end_time IS NULL OR s.end_time <= 0
      ORDER BY s.start_time DESC NULLS LAST, s.source_id DESC
      LIMIT 1
    ),
    'total', (SELECT count(*) FROM staff),
    'present', (SELECT count(*) FROM staff_rows WHERE "checkInAt" IS NOT NULL),
    'staff', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'userId', r."userId",
        'name', r.name,
        'role', r.role_name,
        'status', r.status,
        'checkInAt', r."checkInAt",
        'checkOutAt', r."checkOutAt",
        'leaveType', r."leaveType"
      ) ORDER BY CASE r.status WHEN 'working' THEN 0 WHEN 'done' THEN 1 WHEN 'leave' THEN 2 ELSE 3 END, r.name), '[]'::jsonb)
      FROM staff_rows r
    )
  );
$$;
