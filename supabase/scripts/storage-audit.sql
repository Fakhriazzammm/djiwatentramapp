with samples as (
  select 'pos.booking_orders.payment_proof_image' as key, payment_proof_image as value from pos.booking_orders
  union all select 'pos.booking_settings.logo_url', logo_url from pos.booking_settings
  union all select 'pos.booking_settings.banner_url', banner_url from pos.booking_settings
  union all select 'pos.booking_settings.qris_image', qris_image from pos.booking_settings
  union all select 'pos.financial_transactions.attachment_url', attachment_url from pos.financial_transactions
  union all select 'pos.products.image', image from pos.products
  union all select 'public.pos_attendance_logs.photoUrl', "photoUrl" from public."pos_attendance_logs"
  union all select 'public.pos_booking_orders.paymentProofImage', "paymentProofImage" from public."pos_booking_orders"
  union all select 'public.pos_booking_settings.logoUrl', "logoUrl" from public."pos_booking_settings"
  union all select 'public.pos_booking_settings.bannerUrl', "bannerUrl" from public."pos_booking_settings"
  union all select 'public.pos_booking_settings.qrisImage', "qrisImage" from public."pos_booking_settings"
  union all select 'public.pos_financial_transactions.attachmentUrl', "attachmentUrl" from public."pos_financial_transactions"
  union all select 'public.pos_products.image', image from public."pos_products"
  union all select 'public.pos_products_all.image', image from public."pos_products_all"
)
select
  key,
  count(*) filter (where value is not null and btrim(value) <> '') as filled,
  count(*) filter (where value is not null and btrim(value) <> '' and value ~* '^https?://') as http_url,
  count(*) filter (where value is not null and btrim(value) <> '' and value !~* '^https?://') as non_http,
  count(*) filter (where value is not null and value ilike '%convex.cloud/api/storage/%') as convex_url,
  count(*) filter (where value is not null and value ilike '%supabase.co/storage/v1/object/public/%') as supabase_public
from samples
group by key
order by key;
