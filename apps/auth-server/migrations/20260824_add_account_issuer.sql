-- Better Auth 1.7 upgrade: scope account identity by issuer.
-- Additive and safe for existing credential + Google accounts.

ALTER TABLE public.account
  ADD COLUMN IF NOT EXISTS issuer text;

UPDATE public.account
SET issuer = CASE
  WHEN "providerId" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "providerId"
END
WHERE issuer IS NULL OR issuer = '';

ALTER TABLE public.account
  ALTER COLUMN issuer SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS account_issuer_account_id_uidx
  ON public.account (issuer, "accountId");
