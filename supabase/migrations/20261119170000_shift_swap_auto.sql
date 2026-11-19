-- Tukar shift otomatis: rekan menerima di app → jadwal kedua karyawan langsung bertukar (tanpa menunggu supervisor).
-- Supervisor/admin tetap bisa menyetujui manual dari panel Cuti & Izin; keduanya memakai fungsi yang sama dan tidak pernah menukar dua kali.

CREATE OR REPLACE FUNCTION pos.swap_schedules(p_user_a text, p_user_b text, p_date date)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  a pos.attendance_schedules%ROWTYPE;
  b pos.attendance_schedules%ROWTYPE;
BEGIN
  SELECT * INTO a FROM pos.attendance_schedules WHERE user_id = p_user_a AND date = p_date ORDER BY created_at LIMIT 1 FOR UPDATE;
  SELECT * INTO b FROM pos.attendance_schedules WHERE user_id = p_user_b AND date = p_date ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF a.source_id IS NULL OR b.source_id IS NULL THEN RETURN false; END IF;
  UPDATE pos.attendance_schedules SET shift_name = b.shift_name, start_time = b.start_time, end_time = b.end_time, status = b.status,
    raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('swappedWith', p_user_b, 'swappedAt', now()), updated_at = now() WHERE source_id = a.source_id;
  UPDATE pos.attendance_schedules SET shift_name = a.shift_name, start_time = a.start_time, end_time = a.end_time, status = a.status,
    raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('swappedWith', p_user_a, 'swappedAt', now()), updated_at = now() WHERE source_id = b.source_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION pos.swap_schedules(text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.swap_schedules(text, text, date) TO service_role;

-- Persetujuan manual (admin) memakai fungsi yang sama; BEFORE trigger menandai swapped agar tidak ganda.
CREATE OR REPLACE FUNCTION public.apply_shift_swap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.leave_type <> 'tukar_shift' OR NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;
  IF coalesce(NEW.metadata ->> 'swapped', 'false') = 'true' OR NEW.metadata ->> 'partner_id' IS NULL THEN RETURN NEW; END IF;
  IF pos.swap_schedules(NEW.user_id, NEW.metadata ->> 'partner_id', NEW.start_date) THEN
    NEW.metadata := NEW.metadata || jsonb_build_object('swapped', true, 'swappedBy', 'admin');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_apply_shift_swap ON public.attendance_leave_requests;
CREATE TRIGGER trg_apply_shift_swap
  BEFORE UPDATE OF status ON public.attendance_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_shift_swap();
