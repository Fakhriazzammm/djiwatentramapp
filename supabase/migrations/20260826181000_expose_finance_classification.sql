-- Expose additive finance classification fields to public read view.
CREATE OR REPLACE VIEW public.pos_financial_transactions
WITH (security_invoker = true) AS
SELECT
  source_id AS _id,
  tx_type AS type,
  amount,
  category,
  merchant,
  description,
  tx_date AS date,
  payment_method AS "paymentMethod",
  status,
  order_source_id AS "orderId",
  booking_order_source_id AS "bookingOrderId",
  attachment_url AS "attachmentUrl",
  source_fingerprint AS "sourceFingerprint",
  is_recurring AS "isRecurring",
  recurring_interval AS "recurringInterval",
  tags,
  metadata,
  business_unit AS "businessUnit",
  source_app AS "sourceApp",
  transaction_kind AS "transactionKind",
  is_cash_outflow AS "isCashOutflow",
  cogs_order_source_id AS "cogsOrderSourceId"
FROM pos.financial_transactions;

GRANT SELECT ON public.pos_financial_transactions TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
