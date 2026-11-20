-- Pindah shift saat absen: karyawan absen di shift lain dari jadwalnya, jadwal langsung berganti (tukar atau ambil alih).
CREATE OR REPLACE FUNCTION pos.reassign_shift(p_me text, p_partner text, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  a pos.attendance_schedules%ROWTYPE;
  b pos.attendance_schedules%ROWTYPE;
BEGIN
  SELECT * INTO b FROM pos.attendance_schedules WHERE user_id = p_partner AND date = p_date ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF b.source_id IS NULL OR lower(coalesce(b.shift_name, '')) ~ '(off|libur)' OR b.status = 'off' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'partner_not_working');
  END IF;
  SELECT * INTO a FROM pos.attendance_schedules WHERE user_id = p_me AND date = p_date ORDER BY created_at LIMIT 1 FOR UPDATE;

  IF a.source_id IS NULL THEN
    -- Tidak punya baris jadwal hari itu: ambil alih shift rekan, rekan jadi libur.
    INSERT INTO pos.attendance_schedules (source_id, user_id, date, shift_name, start_time, end_time, status, note, raw)
    VALUES (gen_random_uuid()::text, p_me, p_date, b.shift_name, b.start_time, b.end_time, 'scheduled', 'Pindah shift saat absen', jsonb_build_object('source', 'attendance_reassign', 'from', p_partner));
    UPDATE pos.attendance_schedules SET shift_name = 'OFF', start_time = NULL, end_time = NULL, status = 'off',
      raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('reassignedTo', p_me, 'reassignedAt', now()), updated_at = now() WHERE source_id = b.source_id;
    RETURN jsonb_build_object('ok', true, 'mode', 'take', 'my_old', NULL, 'partner_old', jsonb_build_object('shift', b.shift_name, 'start', b.start_time, 'end', b.end_time));
  END IF;

  UPDATE pos.attendance_schedules SET shift_name = b.shift_name, start_time = b.start_time, end_time = b.end_time, status = b.status,
    raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('swappedWith', p_partner, 'swappedAt', now(), 'swappedBy', 'attendance'), updated_at = now() WHERE source_id = a.source_id;
  UPDATE pos.attendance_schedules SET shift_name = a.shift_name, start_time = a.start_time, end_time = a.end_time, status = a.status,
    raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('swappedWith', p_me, 'swappedAt', now(), 'swappedBy', 'attendance'), updated_at = now() WHERE source_id = b.source_id;
  RETURN jsonb_build_object('ok', true, 'mode', 'swap',
    'my_old', jsonb_build_object('shift', a.shift_name, 'start', a.start_time, 'end', a.end_time, 'status', a.status),
    'partner_old', jsonb_build_object('shift', b.shift_name, 'start', b.start_time, 'end', b.end_time));
END;
$$;
REVOKE ALL ON FUNCTION pos.reassign_shift(text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.reassign_shift(text, text, date) TO service_role;
