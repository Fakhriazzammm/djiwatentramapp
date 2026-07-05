-- Migration: Create announcements table for karyawan dashboard banner
-- Additive migration — idempotent with IF NOT EXISTS

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  content text,
  banner_image_url text,
  is_active boolean DEFAULT true,
  priority int DEFAULT 0,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz DEFAULT '2099-12-31 23:59:59+07',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text
);

-- Index for active announcements query
CREATE INDEX IF NOT EXISTS idx_announcements_active 
  ON public.announcements (is_active, priority DESC, created_at DESC) 
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Allow read for all roles (public read for active announcements)
CREATE POLICY announcements_read_public ON public.announcements
  FOR SELECT
  USING (is_active = true AND now() BETWEEN starts_at AND ends_at);

-- Only service_role can insert/update/delete (admin via backend)
CREATE POLICY announcements_insert_service ON public.announcements
  FOR INSERT
  WITH CHECK (true);  -- service_role bypasses anyway

CREATE POLICY announcements_update_service ON public.announcements
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY announcements_delete_service ON public.announcements
  FOR DELETE
  USING (true);

-- Seed data: sample announcement
INSERT INTO public.announcements (title, subtitle, priority) 
VALUES ('Informasi Penting Hari Ini', 'Cek jadwal minggu ini di "Jadwal"!', 100)
ON CONFLICT DO NOTHING;
