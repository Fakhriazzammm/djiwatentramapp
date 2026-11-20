-- Pengingat penutupan: semua yang masih tercatat masuk diingatkan menjelang shift terakhir selesai,
-- termasuk yang tidak punya jadwal hari itu atau shift-nya sudah lewat. Satu pengingat per orang per hari.
ALTER TABLE pos.attendance_reminder_log DROP CONSTRAINT IF EXISTS attendance_reminder_log_kind_check;
ALTER TABLE pos.attendance_reminder_log ADD CONSTRAINT attendance_reminder_log_kind_check CHECK (kind = ANY (ARRAY['in'::text, 'out'::text, 'close'::text]));
