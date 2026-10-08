-- AI receipt rescan provenance and token-efficient cache.
-- AI results are versions; original receipt/OCR fields remain immutable.

CREATE TABLE IF NOT EXISTS pos.expense_receipt_ai_runs (
  source_id text PRIMARY KEY,
  receipt_source_id text NOT NULL REFERENCES pos.expense_receipt_documents(source_id),
  input_fingerprint text NOT NULL UNIQUE,
  requested_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  provider text NOT NULL DEFAULT '9router',
  model text,
  prompt_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_ai_runs_receipt
  ON pos.expense_receipt_ai_runs (receipt_source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_ai_runs_status
  ON pos.expense_receipt_ai_runs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS pos.expense_receipt_versions (
  source_id text PRIMARY KEY,
  receipt_source_id text NOT NULL REFERENCES pos.expense_receipt_documents(source_id),
  version_no integer NOT NULL,
  source_type text NOT NULL DEFAULT 'ai_rescan',
  provider text NOT NULL DEFAULT '9router',
  model text,
  prompt_version text NOT NULL,
  requested_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  date_conflict boolean NOT NULL DEFAULT false,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_source_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_receipt_versions_receipt
  ON pos.expense_receipt_versions (receipt_source_id, version_no DESC);

CREATE OR REPLACE VIEW public.pos_expense_receipt_ai_runs AS
SELECT
  source_id AS "_id",
  receipt_source_id AS "receiptId",
  input_fingerprint AS "inputFingerprint",
  requested_fields AS "requestedFields",
  provider,
  model,
  prompt_version AS "promptVersion",
  status,
  token_usage AS "tokenUsage",
  error_message AS "errorMessage",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
FROM pos.expense_receipt_ai_runs;

CREATE OR REPLACE VIEW public.pos_expense_receipt_versions AS
SELECT
  source_id AS "_id",
  receipt_source_id AS "receiptId",
  version_no AS "versionNo",
  source_type AS "sourceType",
  provider,
  model,
  prompt_version AS "promptVersion",
  requested_fields AS "requestedFields",
  result,
  date_conflict AS "dateConflict",
  is_current AS "isCurrent",
  created_at AS "createdAt"
FROM pos.expense_receipt_versions;

GRANT SELECT ON public.pos_expense_receipt_ai_runs TO anon, authenticated;
GRANT SELECT ON public.pos_expense_receipt_versions TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
