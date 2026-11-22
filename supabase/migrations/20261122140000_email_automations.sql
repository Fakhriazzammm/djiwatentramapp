-- Email automations: event-driven sends (welcome, win-back, post-order, lead intro, booking confirm/reminder/thanks).
-- Every automation starts disabled; an admin switches it on. Only Edge Functions (service role) touch these tables.
CREATE TABLE IF NOT EXISTS pos.email_automations (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('marketing','transactional')),
  enabled boolean NOT NULL DEFAULT false,
  delay_hours integer NOT NULL DEFAULT 0 CHECK (delay_hours >= 0 AND delay_hours <= 720),
  daily_limit integer NOT NULL DEFAULT 50 CHECK (daily_limit >= 1 AND daily_limit <= 1000),
  subject text,  -- NULL = built-in default from the Edge Function
  html text,     -- NULL = built-in default
  enabled_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos.email_automation_sends (
  id bigserial PRIMARY KEY,
  automation_key text NOT NULL REFERENCES pos.email_automations(key) ON DELETE CASCADE,
  ref_key text NOT NULL,           -- what the email is about (customer, order, booking); UNIQUE => never sent twice
  customer_id text,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','bounced','complained','failed','skipped')),
  provider_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_key, ref_key)
);
CREATE INDEX IF NOT EXISTS email_automation_sends_key_idx ON pos.email_automation_sends (automation_key, created_at DESC);
CREATE INDEX IF NOT EXISTS email_automation_sends_email_idx ON pos.email_automation_sends (email, sent_at DESC);

ALTER TABLE pos.email_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.email_automation_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos.email_automations, pos.email_automation_sends FROM anon, authenticated;
GRANT ALL ON pos.email_automations, pos.email_automation_sends TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pos.email_automation_sends_id_seq TO service_role;

INSERT INTO pos.email_automations (key, name, description, kind, delay_hours, daily_limit) VALUES
  ('welcome', 'Sambutan pelanggan baru', 'Pendaftar baru yang berizin pemasaran menerima email perkenalan Djiwa App.', 'marketing', 2, 50),
  ('winback', 'Ajakan kembali', 'Pelanggan yang >30 hari tidak aktif diajak kembali. Maksimal sekali per 60 hari per orang.', 'marketing', 0, 30),
  ('post_order', 'Terima kasih & pesan lagi', 'Beberapa hari setelah pesanan terakhir, ucapkan terima kasih dan ajak pesan lagi.', 'marketing', 72, 50),
  ('lead_intro', 'Kenalan dengan lead', 'Pembeli tamu yang setuju menerima info diajak membuat akun Djiwa App.', 'marketing', 24, 30),
  ('booking_confirm', 'Konfirmasi reservasi', 'Dikirim otomatis begitu reservasi berstatus terkonfirmasi.', 'transactional', 0, 200),
  ('booking_reminder', 'Pengingat reservasi (H-1)', 'Pengingat sehari sebelum jadwal reservasi.', 'transactional', 0, 200),
  ('booking_thanks', 'Terima kasih setelah berkunjung', 'Sehari setelah jadwal reservasi, ucapkan terima kasih dan ajak kembali.', 'transactional', 0, 200)
ON CONFLICT (key) DO NOTHING;
