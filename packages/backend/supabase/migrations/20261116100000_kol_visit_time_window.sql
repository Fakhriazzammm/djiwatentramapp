-- KOL visit: jam datang hanya 11:00-17:00 WIB. Additive; menggantikan fungsi insert booking bersama
-- dengan satu pemeriksaan tambahan (INVALID_BOOKING_TIME). Aturan lain tidak berubah:
-- satu tanggal = satu KOL (idx_kol_visit_one_active_per_day) dan satu booking aktif per KOL.
CREATE OR REPLACE FUNCTION pos.kol_insert_shared_visit_booking(
  p_kol_id text,
  p_booking_date date,
  p_booking_time time,
  p_consent_terms boolean,
  p_consent_attendance boolean,
  p_actor_id text,
  p_require_eligibility boolean
)
RETURNS TABLE(id bigint, booking_date date, booking_time time, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
DECLARE
  v_eligible boolean;
  v_booking pos.kol_visit_bookings%ROWTYPE;
  v_constraint text;
BEGIN
  IF p_booking_date <= (now() AT TIME ZONE 'Asia/Jakarta')::date OR p_booking_time IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_BOOKING_DATE';
  END IF;
  IF p_booking_time < time '11:00' OR p_booking_time > time '17:00' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_BOOKING_TIME';
  END IF;
  IF p_consent_terms IS DISTINCT FROM true OR p_consent_attendance IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CONSENT_REQUIRED';
  END IF;
  IF p_actor_id IS NULL OR length(btrim(p_actor_id)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'UNAUTHORIZED';
  END IF;

  SELECT c.visit_booking_eligible
    INTO v_eligible
    FROM pos.kol_creators c
   WHERE c.source_id = p_kol_id AND c.status <> 'Rejected'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'KOL_PROFILE_NOT_FOUND';
  END IF;
  IF p_require_eligibility AND v_eligible IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'VISIT_NOT_ELIGIBLE';
  END IF;
  IF EXISTS (SELECT 1 FROM pos.kol_visit_bookings b WHERE b.kol_id = p_kol_id AND b.status IN ('requested','confirmed')) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREATOR_ALREADY_HAS_ACTIVE_BOOKING';
  END IF;

  INSERT INTO pos.kol_visit_bookings(
    kol_id, booking_date, booking_time, status, consent_terms, consent_attendance,
    consent_version, consent_text, consented_at
  ) VALUES (
    p_kol_id, p_booking_date, p_booking_time, 'requested', true, true,
    'kol-visit-v1',
    'Saya telah membaca dan menyetujui ketentuan kunjungan Djiwa Tentram. Saya siap hadir pada tanggal dan jam yang saya pilih.',
    now()
  ) RETURNING * INTO v_booking;

  INSERT INTO pos.kol_visit_booking_events(booking_id, kol_id, event_type, actor_type, actor_id, payload)
  VALUES (v_booking.id, p_kol_id, 'booking_created', 'creator', p_actor_id,
          jsonb_build_object('bookingDate', p_booking_date, 'bookingTime', p_booking_time, 'consentVersion', 'kol-visit-v1'));

  RETURN QUERY SELECT v_booking.id, v_booking.booking_date, v_booking.booking_time, v_booking.status;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'idx_kol_visit_one_active_per_creator' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CREATOR_ALREADY_HAS_ACTIVE_BOOKING';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DATE_ALREADY_BOOKED';
END;
$$;

REVOKE ALL ON FUNCTION pos.kol_insert_shared_visit_booking(text,date,time,boolean,boolean,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.kol_insert_shared_visit_booking(text,date,time,boolean,boolean,text,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
