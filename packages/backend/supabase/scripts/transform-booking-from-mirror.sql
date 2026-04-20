insert into pos.booking_settings (
  source_id,
  slug,
  title,
  description,
  logo_url,
  banner_url,
  theme_color,
  social_links,
  featured_product_ids,
  payment_methods,
  bank_details,
  qris_image,
  is_active,
  custom_fields,
  creation_time,
  raw
)
select
  document_id,
  coalesce(nullif(document->>'slug', ''), 'booking'),
  coalesce(document->>'title', ''),
  nullif(document->>'description', ''),
  nullif(document->>'logoUrl', ''),
  nullif(document->>'bannerUrl', ''),
  nullif(document->>'themeColor', ''),
  document->'socialLinks',
  document->'featuredProductIds',
  document->'paymentMethods',
  nullif(document->>'bankDetails', ''),
  nullif(document->>'qrisImage', ''),
  coalesce((nullif(document->>'isActive', ''))::boolean, false),
  document->'customFields',
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'bookingSettings'
on conflict (source_id) do update
set
  slug = excluded.slug,
  title = excluded.title,
  description = excluded.description,
  logo_url = excluded.logo_url,
  banner_url = excluded.banner_url,
  theme_color = excluded.theme_color,
  social_links = excluded.social_links,
  featured_product_ids = excluded.featured_product_ids,
  payment_methods = excluded.payment_methods,
  bank_details = excluded.bank_details,
  qris_image = excluded.qris_image,
  is_active = excluded.is_active,
  custom_fields = excluded.custom_fields,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.booking_date_capacity (
  source_id,
  slug,
  booking_date,
  max_people,
  max_tables,
  people_per_table,
  notes,
  creation_time,
  raw
)
select
  document_id,
  coalesce(nullif(document->>'slug', ''), 'booking'),
  coalesce(document->>'date', ''),
  coalesce((nullif(document->>'maxPeople', ''))::integer, 0),
  coalesce((nullif(document->>'maxTables', ''))::integer, 0),
  coalesce((nullif(document->>'peoplePerTable', ''))::integer, 4),
  nullif(document->>'notes', ''),
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'bookingDateCapacity'
on conflict (source_id) do update
set
  slug = excluded.slug,
  booking_date = excluded.booking_date,
  max_people = excluded.max_people,
  max_tables = excluded.max_tables,
  people_per_table = excluded.people_per_table,
  notes = excluded.notes,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.booking_orders (
  source_id,
  slug,
  booking_code,
  customer_name,
  customer_phone,
  customer_email,
  notes,
  booking_date,
  total_amount,
  payment_method,
  payment_status,
  booking_status,
  guest_count,
  table_count,
  payment_proof_image,
  transferred_amount,
  custom_answers,
  created_at,
  creation_time,
  raw
)
select
  document_id,
  coalesce(nullif(document->>'slug', ''), 'booking'),
  coalesce(document->>'bookingCode', document_id),
  coalesce(document->>'customerName', ''),
  coalesce(document->>'customerPhone', ''),
  coalesce(document->>'customerEmail', ''),
  nullif(document->>'notes', ''),
  coalesce(document->>'bookingDate', ''),
  coalesce((nullif(document->>'totalAmount', ''))::numeric, 0),
  nullif(document->>'paymentMethod', ''),
  nullif(document->>'paymentStatus', ''),
  nullif(document->>'bookingStatus', ''),
  (nullif(document->>'guestCount', ''))::integer,
  (nullif(document->>'tableCount', ''))::integer,
  nullif(document->>'paymentProofImage', ''),
  (nullif(document->>'transferredAmount', ''))::numeric,
  document->'customAnswers',
  (nullif(document->>'createdAt', ''))::double precision,
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'bookingOrders'
on conflict (source_id) do update
set
  slug = excluded.slug,
  booking_code = excluded.booking_code,
  customer_name = excluded.customer_name,
  customer_phone = excluded.customer_phone,
  customer_email = excluded.customer_email,
  notes = excluded.notes,
  booking_date = excluded.booking_date,
  total_amount = excluded.total_amount,
  payment_method = excluded.payment_method,
  payment_status = excluded.payment_status,
  booking_status = excluded.booking_status,
  guest_count = excluded.guest_count,
  table_count = excluded.table_count,
  payment_proof_image = excluded.payment_proof_image,
  transferred_amount = excluded.transferred_amount,
  custom_answers = excluded.custom_answers,
  created_at = excluded.created_at,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

delete from pos.booking_order_items;

insert into pos.booking_order_items (
  booking_order_source_id,
  line_no,
  product_source_id,
  product_name,
  price,
  quantity,
  raw
)
select
  d.document_id,
  item.ordinality::integer,
  nullif(item.value->>'productId', ''),
  nullif(item.value->>'name', ''),
  coalesce((nullif(item.value->>'price', ''))::numeric, 0),
  coalesce((nullif(item.value->>'quantity', ''))::numeric, 0),
  item.value
from legacy_mirror.documents d
cross join lateral jsonb_array_elements(
  coalesce(d.document->'items', '[]'::jsonb)
) with ordinality as item(value, ordinality)
where d.table_name = 'bookingOrders';

