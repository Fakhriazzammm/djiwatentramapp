-- Karyawan app v5: absen langsung di app, koreksi absen, tukar shift.
-- Additive and idempotent.

-- 1. Pengajuan koreksi absen & tukar shift memakai tabel Cuti & Izin yang sudah punya alur review.
ALTER TABLE public.attendance_leave_requests
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.attendance_leave_requests
  DROP CONSTRAINT IF EXISTS attendance_leave_requests_leave_type_check;
ALTER TABLE public.attendance_leave_requests
  ADD CONSTRAINT attendance_leave_requests_leave_type_check
  CHECK (leave_type IN ('izin', 'cuti', 'sakit', 'other', 'koreksi_absen', 'tukar_shift'));

-- 2. Koreksi yang disetujui otomatis menulis log absen koreksi (source = 'correction').
CREATE OR REPLACE FUNCTION public.apply_attendance_correction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_ts bigint;
BEGIN
  IF NEW.leave_type <> 'koreksi_absen' OR NEW.status <> 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;
  v_type := NEW.metadata ->> 'type';
  IF v_type NOT IN ('check_in', 'check_out') THEN
    RETURN NEW;
  END IF;
  -- tanggal (WIB) + jam benar -> epoch ms
  v_ts := (extract(epoch FROM ((NEW.start_date::text || ' ' || (NEW.metadata ->> 'time'))::timestamp AT TIME ZONE 'Asia/Jakarta')) * 1000)::bigint;
  INSERT INTO legacy_mirror.documents (table_name, document_id, creation_time, document)
  VALUES (
    'attendance',
    'att_cor_' || replace(NEW.id::text, '-', ''),
    v_ts,
    jsonb_build_object(
      'userId', NEW.user_id,
      'type', v_type,
      'timestamp', v_ts,
      'source', 'correction',
      'notes', 'Koreksi absen disetujui: ' || coalesce(NEW.reason, '')
    )
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_attendance_correction ON public.attendance_leave_requests;
CREATE TRIGGER trg_apply_attendance_correction
  AFTER UPDATE OF status ON public.attendance_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_attendance_correction();

-- 2b. Tukar shift yang disetujui menukar jadwal kedua karyawan pada tanggal itu.
CREATE OR REPLACE FUNCTION public.apply_shift_swap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a pos.attendance_schedules%ROWTYPE;
  b pos.attendance_schedules%ROWTYPE;
  v_partner text;
BEGIN
  IF NEW.leave_type <> 'tukar_shift' OR NEW.status <> 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;
  v_partner := NEW.metadata ->> 'partner_id';
  IF v_partner IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO a FROM pos.attendance_schedules WHERE user_id = NEW.user_id AND date = NEW.start_date LIMIT 1;
  SELECT * INTO b FROM pos.attendance_schedules WHERE user_id = v_partner AND date = NEW.start_date LIMIT 1;
  IF a.source_id IS NULL OR b.source_id IS NULL THEN RETURN NEW; END IF;
  UPDATE pos.attendance_schedules SET shift_name = b.shift_name, start_time = b.start_time, end_time = b.end_time, status = b.status, updated_at = now() WHERE source_id = a.source_id;
  UPDATE pos.attendance_schedules SET shift_name = a.shift_name, start_time = a.start_time, end_time = a.end_time, status = a.status, updated_at = now() WHERE source_id = b.source_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_shift_swap ON public.attendance_leave_requests;
CREATE TRIGGER trg_apply_shift_swap
  AFTER UPDATE OF status ON public.attendance_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_shift_swap();

-- 3. Percobaan verifikasi absen (batas PIN salah). Hanya service_role.
CREATE TABLE IF NOT EXISTS public.attendance_verify_attempts (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  ok boolean NOT NULL,
  method text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_verify_attempts_user
  ON public.attendance_verify_attempts (user_id, created_at DESC);
ALTER TABLE public.attendance_verify_attempts ENABLE ROW LEVEL SECURITY;
