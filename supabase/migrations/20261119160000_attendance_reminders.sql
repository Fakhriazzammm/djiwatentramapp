-- Pengingat absen 15 menit sebelum shift mulai dan 15 menit sebelum shift berakhir (grup Report + DM Telegram).
CREATE TABLE IF NOT EXISTS pos.attendance_reminder_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  lead_minutes int NOT NULL DEFAULT 15,
  cron_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex')
);
INSERT INTO pos.attendance_reminder_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE pos.attendance_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pos.attendance_reminder_log (
  user_id text NOT NULL,
  date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  shift_name text,
  sent_group boolean NOT NULL DEFAULT false,
  sent_dm boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date, kind)
);
ALTER TABLE pos.attendance_reminder_log ENABLE ROW LEVEL SECURITY;

-- Tiap menit: hanya memanggil fungsi bila ada jadwal hari ini yang mulai/berakhir dalam 16 menit ke depan.
SELECT cron.unschedule('attendance-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'attendance-reminders');
SELECT cron.schedule('attendance-reminders', '* * * * *', $$
  select net.http_post(
    url := 'http://kong:8000/functions/v1/attendance-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', (select cron_token from pos.attendance_reminder_settings where id = 1)),
    body := '{}'::jsonb)
  where (select enabled from pos.attendance_reminder_settings where id = 1)
    and exists (
      select 1 from pos.attendance_schedules s
      where s.date = (now() at time zone 'Asia/Jakarta')::date
        and s.status <> 'off' and s.start_time is not null
        and (
          (s.start_time - (now() at time zone 'Asia/Jakarta')::time) between interval '0' and interval '16 minutes'
          or (s.end_time is not null and (s.end_time - (now() at time zone 'Asia/Jakarta')::time) between interval '0' and interval '16 minutes')
        ));
$$);

GRANT SELECT, INSERT, UPDATE, DELETE ON pos.attendance_reminder_settings, pos.attendance_reminder_log TO service_role;
