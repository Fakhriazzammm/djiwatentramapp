BEGIN;

-- Normalize legacy contract templates where the signing block was stored with
-- literal backslash-n characters instead of real newlines.
UPDATE public.pos_site_settings
SET raw = jsonb_set(
  raw,
  ARRAY['employeeOnboarding', 'contractTemplatesByRoleId'],
  (
    SELECT jsonb_object_agg(key, replace(value, chr(92) || 'n', chr(10)))
    FROM jsonb_each_text(raw->'employeeOnboarding'->'contractTemplatesByRoleId')
  )
)
WHERE raw->'employeeOnboarding'->'contractTemplatesByRoleId' IS NOT NULL;

COMMIT;
