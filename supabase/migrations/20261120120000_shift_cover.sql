-- Pengganti shift untuk izin / sakit / cuti.
-- Karyawan yang tidak masuk shift-nya digantikan rekan yang sedang libur (atau belum punya jadwal) pada hari itu.
-- Berbeda dari tukar shift: yang menggantikan tidak perlu menyerahkan shift apa pun, yang tidak masuk jadi libur (OFF).
-- Semua perubahan bisa dibatalkan (uncover_shift) dan mengembalikan jadwal seperti semula.

CREATE OR REPLACE FUNCTION pos.cover_candidates(p_absent text, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  v_role text;
  v_week date := date_trunc('week', p_date::timestamp)::date;
BEGIN
  SELECT role_source_id INTO v_role FROM public.yumi_users WHERE source_id = p_absent;
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY (x->>'sameRole')::boolean DESC, (x->>'weekShifts')::int ASC, x->>'name')
    FROM (
      SELECT jsonb_build_object(
        'userId', u.source_id,
        'name', u.name,
        'roleName', trim(coalesce(r.name, '')),
        'sameRole', (u.role_source_id IS NOT DISTINCT FROM v_role),
        'state', CASE WHEN s.source_id IS NULL THEN 'unscheduled' ELSE 'off' END,
        'weekShifts', (
          SELECT count(*) FROM pos.attendance_schedules w
          WHERE w.user_id = u.source_id AND w.date >= v_week AND w.date < v_week + 7
            AND w.status <> 'off' AND lower(coalesce(w.shift_name, '')) !~ '(off|libur)'
        )
      ) AS x
      FROM public.yumi_users u
      LEFT JOIN public.yumi_roles r ON r.source_id = u.role_source_id
      LEFT JOIN pos.attendance_schedules s ON s.user_id = u.source_id AND s.date = p_date
      WHERE u.is_active
        AND u.source_id <> p_absent
        AND lower(trim(coalesce(r.name, ''))) NOT IN ('owner', 'admin', 'manager', 'hrd', 'client_viewer')
        AND (s.source_id IS NULL OR s.status = 'off' OR lower(coalesce(s.shift_name, '')) ~ '(off|libur)')
        -- hanya staf yang aktif absen dalam 60 hari terakhir
        AND EXISTS (
          SELECT 1 FROM public.pos_attendance_logs l
          WHERE l."userId" = u.source_id AND l."timestamp" > (extract(epoch FROM now()) * 1000 - 60 * 86400000::bigint)
        )
        -- tidak sedang izin/cuti/sakit pada tanggal itu
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance_leave_requests q
          WHERE q.user_id = u.source_id AND q.status IN ('pending', 'approved')
            AND q.leave_type IN ('cuti', 'izin', 'sakit', 'other') AND p_date BETWEEN q.start_date AND q.end_date
        )
        -- belum punya permintaan pengganti/tukar yang menunggu pada tanggal itu
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance_leave_requests q
          WHERE q.status = 'pending' AND q.leave_type IN ('pengganti_shift', 'tukar_shift') AND q.start_date = p_date
            AND (q.user_id = u.source_id OR q.metadata ->> 'partner_id' = u.source_id)
        )
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION pos.cover_shift(p_absent text, p_cover text, p_date date, p_leave_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  a pos.attendance_schedules%ROWTYPE;
  b pos.attendance_schedules%ROWTYPE;
BEGIN
  IF p_absent = p_cover THEN RETURN jsonb_build_object('ok', false, 'reason', 'same_user'); END IF;
  SELECT * INTO a FROM pos.attendance_schedules WHERE user_id = p_absent AND date = p_date ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF a.source_id IS NULL OR a.status = 'off' OR lower(coalesce(a.shift_name, '')) ~ '(off|libur)' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'absent_not_working');
  END IF;
  SELECT * INTO b FROM pos.attendance_schedules WHERE user_id = p_cover AND date = p_date ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF b.source_id IS NOT NULL AND b.status <> 'off' AND lower(coalesce(b.shift_name, '')) !~ '(off|libur)' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cover_busy');
  END IF;

  IF b.source_id IS NULL THEN
    INSERT INTO pos.attendance_schedules (source_id, user_id, date, shift_name, start_time, end_time, status, note, raw)
    VALUES (gen_random_uuid()::text, p_cover, p_date, a.shift_name, a.start_time, a.end_time, 'scheduled', 'Pengganti shift',
      jsonb_build_object('coverFor', p_absent, 'coverAt', now(), 'insertedByCover', true, 'leaveId', p_leave_id));
  ELSE
    UPDATE pos.attendance_schedules SET shift_name = a.shift_name, start_time = a.start_time, end_time = a.end_time, status = 'scheduled',
      note = 'Pengganti shift',
      raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('coverFor', p_absent, 'coverAt', now(), 'prevShift', b.shift_name, 'prevStatus', b.status, 'leaveId', p_leave_id),
      updated_at = now() WHERE source_id = b.source_id;
  END IF;

  UPDATE pos.attendance_schedules SET shift_name = 'OFF', start_time = NULL, end_time = NULL, status = 'off',
    raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('coveredBy', p_cover, 'coveredAt', now(), 'originalShift', a.shift_name,
      'originalStart', a.start_time, 'originalEnd', a.end_time, 'originalStatus', a.status, 'leaveId', p_leave_id),
    updated_at = now() WHERE source_id = a.source_id;

  RETURN jsonb_build_object('ok', true, 'shift', a.shift_name, 'start', a.start_time, 'end', a.end_time);
END;
$$;

CREATE OR REPLACE FUNCTION pos.uncover_shift(p_absent text, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  a pos.attendance_schedules%ROWTYPE;
  b pos.attendance_schedules%ROWTYPE;
  v_cover text;
BEGIN
  SELECT * INTO a FROM pos.attendance_schedules WHERE user_id = p_absent AND date = p_date AND raw ? 'coveredBy' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
  IF a.source_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_covered'); END IF;
  v_cover := a.raw ->> 'coveredBy';
  SELECT * INTO b FROM pos.attendance_schedules WHERE user_id = v_cover AND date = p_date AND raw ->> 'coverFor' = p_absent ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;

  UPDATE pos.attendance_schedules SET shift_name = a.raw ->> 'originalShift',
    start_time = nullif(a.raw ->> 'originalStart', '')::time, end_time = nullif(a.raw ->> 'originalEnd', '')::time,
    status = coalesce(a.raw ->> 'originalStatus', 'scheduled'),
    raw = (coalesce(raw, '{}'::jsonb) - 'coveredBy' - 'coveredAt' - 'originalShift' - 'originalStart' - 'originalEnd' - 'originalStatus'),
    updated_at = now() WHERE source_id = a.source_id;

  IF b.source_id IS NOT NULL THEN
    IF coalesce((b.raw ->> 'insertedByCover')::boolean, false) THEN
      DELETE FROM pos.attendance_schedules WHERE source_id = b.source_id;
    ELSE
      UPDATE pos.attendance_schedules SET shift_name = coalesce(b.raw ->> 'prevShift', 'OFF'), start_time = NULL, end_time = NULL,
        status = coalesce(b.raw ->> 'prevStatus', 'off'), note = NULL,
        raw = (coalesce(raw, '{}'::jsonb) - 'coverFor' - 'coverAt' - 'prevShift' - 'prevStatus'), updated_at = now()
      WHERE source_id = b.source_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'coverUserId', v_cover);
END;
$$;

REVOKE ALL ON FUNCTION pos.cover_candidates(text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.cover_shift(text, text, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.uncover_shift(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.cover_candidates(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION pos.cover_shift(text, text, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.uncover_shift(text, date) TO service_role;
