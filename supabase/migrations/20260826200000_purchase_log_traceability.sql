-- Add traceability fields to legacy purchase logs.
-- Additive only: preserves existing receipt text and amounts.

ALTER TABLE public.pos_purchase_logs
  ADD COLUMN IF NOT EXISTS source_transaction_id text,
  ADD COLUMN IF NOT EXISTS trace_id text,
  ADD COLUMN IF NOT EXISTS ocr_item_id text,
  ADD COLUMN IF NOT EXISTS correction_status text NOT NULL DEFAULT 'NONE';

CREATE INDEX IF NOT EXISTS pos_purchase_logs_source_transaction_idx
  ON public.pos_purchase_logs (source_transaction_id);

CREATE INDEX IF NOT EXISTS pos_purchase_logs_trace_idx
  ON public.pos_purchase_logs (trace_id);
