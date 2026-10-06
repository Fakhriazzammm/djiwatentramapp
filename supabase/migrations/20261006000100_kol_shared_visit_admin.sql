-- Shared KOL visit booking and admin eligibility. Additive and safe to re-run.
ALTER TABLE pos.kol_creators
  ADD COLUMN IF NOT EXISTS visit_booking_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visit_booking_eligible_by text,
  ADD COLUMN IF NOT EXISTS visit_booking_eligible_at timestamptz,
  ADD COLUMN IF NOT EXISTS visit_booking_eligibility_note text;

ALTER TABLE pos.kol_visit_booking_events
  DROP CONSTRAINT IF EXISTS kol_visit_booking_events_event_type_check;
ALTER TABLE pos.kol_visit_booking_events
  ADD CONSTRAINT kol_visit_booking_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'invite_created','invite_opened','google_authenticated','identity_linked',
    'booking_requested','booking_confirmed','booking_cancelled','booking_rescheduled','invite_revoked',
    'booking_created','invited_booking_created','booking_eligibility_changed','booking_status_changed'
  ]::text[]));

ALTER TABLE pos.kol_visit_bookings
  ADD COLUMN IF NOT EXISTS booking_time time,
  ADD COLUMN IF NOT EXISTS consent_terms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_attendance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_version text,
  ADD COLUMN IF NOT EXISTS consent_text text,
  ADD COLUMN IF NOT EXISTS consented_at timestamptz;

CREATE OR REPLACE VIEW public.pos_kol_visit_calendar AS
SELECT v.booking_date,
       v.status,
       COALESCE(NULLIF(btrim(p.display_name), ''), c.name) AS creator_name,
       c.username,
       v.booking_time
  FROM pos.kol_visit_bookings v
  JOIN pos.kol_creators c ON c.source_id = v.kol_id
  LEFT JOIN pos.kol_profiles p ON p.kol_id = c.source_id
 WHERE v.status = ANY (ARRAY['requested','confirmed','completed']);

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

CREATE OR REPLACE FUNCTION pos.kol_request_shared_visit_booking(
  p_kol_id text,
  p_booking_date date,
  p_booking_time time,
  p_consent_terms boolean,
  p_consent_attendance boolean,
  p_actor_id text
)
RETURNS TABLE(id bigint, booking_date date, booking_time time, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
  SELECT * FROM pos.kol_insert_shared_visit_booking(
    p_kol_id, p_booking_date, p_booking_time, p_consent_terms, p_consent_attendance, p_actor_id, true
  );
$$;

CREATE OR REPLACE FUNCTION pos.kol_request_invited_visit_booking_v2(
  p_invitation_id uuid,
  p_kol_id text,
  p_booking_date date,
  p_booking_time time,
  p_consent_terms boolean,
  p_consent_attendance boolean,
  p_actor_id text
)
RETURNS TABLE(id bigint, booking_date date, booking_time time, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
DECLARE
  v_invitation pos.kol_visit_invitations%ROWTYPE;
  v_booking record;
BEGIN
  SELECT * INTO v_invitation
    FROM pos.kol_visit_invitations i
   WHERE i.id = p_invitation_id AND i.kol_id = p_kol_id
     AND i.expires_at > now() AND i.revoked_at IS NULL
     AND i.status IN ('created','opened','authenticated','linked','schedule_selected')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVITATION_NOT_VALID';
  END IF;

  SELECT * INTO v_booking FROM pos.kol_insert_shared_visit_booking(
    p_kol_id, p_booking_date, p_booking_time, p_consent_terms, p_consent_attendance, p_actor_id, false
  );
  UPDATE pos.kol_visit_invitations
     SET status = 'schedule_selected', schedule_selected_at = coalesce(schedule_selected_at, now()), updated_at = now()
   WHERE id = p_invitation_id;
  INSERT INTO pos.kol_visit_booking_events(booking_id, invitation_id, kol_id, event_type, actor_type, actor_id, payload)
  VALUES (v_booking.id, p_invitation_id, p_kol_id, 'invited_booking_created', 'creator', p_actor_id,
          jsonb_build_object('bookingDate', p_booking_date, 'bookingTime', p_booking_time, 'consentVersion', 'kol-visit-v1'));
  RETURN QUERY SELECT v_booking.id, v_booking.booking_date, v_booking.booking_time, v_booking.status;
END;
$$;

REVOKE ALL ON FUNCTION pos.kol_insert_shared_visit_booking(text,date,time,boolean,boolean,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.kol_request_shared_visit_booking(text,date,time,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.kol_request_invited_visit_booking_v2(uuid,text,date,time,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.kol_insert_shared_visit_booking(text,date,time,boolean,boolean,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION pos.kol_request_shared_visit_booking(text,date,time,boolean,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.kol_request_invited_visit_booking_v2(uuid,text,date,time,boolean,boolean,text) TO service_role;

NOTIFY pgrst, 'reload schema';
