-- Catatan kegagalan absen dari app dan server (untuk diagnosis: lokasi, kamera, wajah, PIN, jadwal).
CREATE TABLE IF NOT EXISTS public.attendance_client_events (
  id bigserial PRIMARY KEY,
  user_id text,
  stage text NOT NULL,           -- preflight | location | camera | face | pin | clock_in | closing | enroll
  code text NOT NULL,
  detail text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_client_events_time ON public.attendance_client_events (created_at DESC);
ALTER TABLE public.attendance_client_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.attendance_client_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.attendance_client_events_id_seq TO service_role;
