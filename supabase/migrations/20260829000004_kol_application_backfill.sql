-- Best-effort backfill for KOL applications created before application_data existed.
-- Only fills empty application_data and preserves the original public_reason unchanged.
UPDATE pos.kol_creators
SET application_data = jsonb_build_object(
  'contentTypes', CASE
    WHEN public_reason ~ 'Minat konten:' THEN to_jsonb(string_to_array(trim((regexp_match(public_reason, 'Minat konten: ([^\n]*)'))[1]), ', '))
    ELSE '[]'::jsonb
  END,
  'collaboration', COALESCE((regexp_match(public_reason, 'Bentuk kolaborasi: ([^\n]*)'))[1], ''),
  'visitDate', COALESCE((regexp_match(public_reason, 'Ketersediaan kunjungan: ([0-9]{4}-[0-9]{2}-[0-9]{2})'))[1], ''),
  'visitTime', COALESCE((regexp_match(public_reason, 'Ketersediaan kunjungan: [^\n]* pukul ([0-9]{2}:[0-9]{2})'))[1], ''),
  'barter', COALESCE((regexp_match(public_reason, 'Preferensi value: ([^\n]*)'))[1], '')
)
WHERE public_reason IS NOT NULL
  AND application_data = '{}'::jsonb;

-- ROLLBACK (manual):
-- UPDATE pos.kol_creators SET application_data = '{}'::jsonb WHERE application_data IS NOT NULL;
