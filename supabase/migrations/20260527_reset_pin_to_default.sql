-- =============================================================================
-- Reset PIN ke default 696969 untuk semua karyawan existing
-- 
-- Masalah: User yang sudah di-approve oleh admin tidak tahu PIN mereka
-- karena PIN asli tidak disimpan saat registrasi (fix di PR sebelumnya).
-- 
-- Solusi: Set semua PIN ke "696969" + trigger requiresPinChange
-- agar user diminta ganti PIN saat login pertama.
-- 
-- SHA-256("696969") = c2eb7898bb6771503ffee5d0c722e5b561fe480edbc30141880a1cdf1e5b1cf6
-- =============================================================================

-- 1. Drop UNIQUE index so multiple users can share default PIN 696969
DROP INDEX IF EXISTS idx_yumi_users_home_pin_fingerprint;

-- 2. Reset semua active yumi_users (non-admin) ke PIN default 696969
--    dan set requiresPinChange = true agar muncul banner "ganti PIN"
UPDATE yumi_users
SET
	home_pin_fingerprint = 'c2eb7898bb6771503ffee5d0c722e5b561fe480edbc30141880a1cdf1e5b1cf6',
	raw = jsonb_set(
		COALESCE(raw, '{}'::jsonb),
		'{requiresPinChange}',
		'true'::jsonb
	)
WHERE is_active = true;

-- 3. Buat non-unique index untuk query performance (tanpa uniqueness constraint)
CREATE INDEX idx_yumi_users_home_pin_fingerprint_nonunique
	ON yumi_users (home_pin_fingerprint)
	WHERE home_pin_fingerprint IS NOT NULL;

-- 4. Verifikasi
SELECT
	source_id,
	name,
	home_pin_fingerprint,
	raw->>'requiresPinChange' AS requires_pin_change
FROM yumi_users
WHERE is_active = true
ORDER BY name;
