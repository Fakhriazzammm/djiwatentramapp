BEGIN;

-- Backfill legacy approved application so the employee can continue the contract flow.
-- Idempotent: does not overwrite a registration number that may already exist.
UPDATE public.employee_onboarding_applications
SET registration_number = COALESCE(registration_number, '209d23ae-d862-4586-9fe7-f6182b15bef0'),
    raw = jsonb_set(
      COALESCE(raw, '{}'::jsonb),
      '{registrationNumber}',
      to_jsonb(COALESCE(raw->>'registrationNumber', '209d23ae-d862-4586-9fe7-f6182b15bef0')::text),
      true
    )
WHERE id = '209d23ae-d862-4586-9fe7-f6182b15bef0'
  AND (registration_number IS NULL OR raw->>'registrationNumber' IS NULL);

COMMIT;
