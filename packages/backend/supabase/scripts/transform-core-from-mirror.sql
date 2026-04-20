insert into pos.categories (
  source_id,
  name,
  display_order,
  parent_source_id,
  track,
  creation_time,
  raw
)
select
  document_id,
  coalesce(document->>'name', ''),
  coalesce((nullif(document->>'order', ''))::integer, 0),
  nullif(document->>'parentId', ''),
  nullif(document->>'track', ''),
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'categories'
on conflict (source_id) do update
set
  name = excluded.name,
  display_order = excluded.display_order,
  parent_source_id = excluded.parent_source_id,
  track = excluded.track,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.products (
  source_id,
  category_source_id,
  name,
  description,
  price,
  promo_price,
  image,
  is_available,
  quantity,
  menu_number,
  variations,
  creation_time,
  raw
)
select
  document_id,
  nullif(document->>'categoryId', ''),
  coalesce(document->>'name', ''),
  nullif(document->>'description', ''),
  coalesce((nullif(document->>'price', ''))::numeric, 0),
  (nullif(document->>'promoPrice', ''))::numeric,
  nullif(document->>'image', ''),
  coalesce((nullif(document->>'isAvailable', ''))::boolean, true),
  (nullif(document->>'quantity', ''))::numeric,
  (nullif(document->>'menuNumber', ''))::integer,
  document->'variations',
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'products'
on conflict (source_id) do update
set
  category_source_id = excluded.category_source_id,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  promo_price = excluded.promo_price,
  image = excluded.image,
  is_available = excluded.is_available,
  quantity = excluded.quantity,
  menu_number = excluded.menu_number,
  variations = excluded.variations,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.inventory (
  source_id,
  ingredient_name,
  unit,
  quantity,
  low_stock_threshold,
  display_unit,
  conversion_factor,
  unit_conversions,
  base_recipe_source_id,
  default_brand_name,
  preferred_store_source_id,
  preferred_purchase_quantity,
  preferred_purchase_unit,
  aliases,
  last_purchase_price,
  last_purchase_at,
  last_purchase_store_source_id,
  creation_time,
  raw
)
select
  document_id,
  coalesce(document->>'ingredientName', ''),
  coalesce(document->>'unit', ''),
  coalesce((nullif(document->>'quantity', ''))::numeric, 0),
  coalesce((nullif(document->>'lowStockThreshold', ''))::numeric, 0),
  nullif(document->>'displayUnit', ''),
  (nullif(document->>'conversionFactor', ''))::numeric,
  document->'unitConversions',
  nullif(document->>'baseRecipeId', ''),
  nullif(document->>'defaultBrandName', ''),
  nullif(document->>'preferredStoreId', ''),
  (nullif(document->>'preferredPurchaseQuantity', ''))::numeric,
  nullif(document->>'preferredPurchaseUnit', ''),
  document->'aliases',
  (nullif(document->>'lastPurchasePrice', ''))::numeric,
  (nullif(document->>'lastPurchaseAt', ''))::double precision,
  nullif(document->>'lastPurchaseStoreId', ''),
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'inventory'
on conflict (source_id) do update
set
  ingredient_name = excluded.ingredient_name,
  unit = excluded.unit,
  quantity = excluded.quantity,
  low_stock_threshold = excluded.low_stock_threshold,
  display_unit = excluded.display_unit,
  conversion_factor = excluded.conversion_factor,
  unit_conversions = excluded.unit_conversions,
  base_recipe_source_id = excluded.base_recipe_source_id,
  default_brand_name = excluded.default_brand_name,
  preferred_store_source_id = excluded.preferred_store_source_id,
  preferred_purchase_quantity = excluded.preferred_purchase_quantity,
  preferred_purchase_unit = excluded.preferred_purchase_unit,
  aliases = excluded.aliases,
  last_purchase_price = excluded.last_purchase_price,
  last_purchase_at = excluded.last_purchase_at,
  last_purchase_store_source_id = excluded.last_purchase_store_source_id,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.inventory_transactions (
  source_id,
  inventory_source_id,
  quantity,
  tx_type,
  cost_per_unit,
  remaining_quantity,
  tx_timestamp,
  notes,
  expiry_date,
  brand_name,
  store_source_id,
  purchase_unit,
  purchase_quantity,
  line_total,
  source_transaction_id,
  source_label,
  source_fingerprint,
  creation_time,
  raw
)
select
  document_id,
  coalesce(document->>'inventoryId', ''),
  coalesce((nullif(document->>'quantity', ''))::numeric, 0),
  coalesce(document->>'type', ''),
  (nullif(document->>'costPerUnit', ''))::numeric,
  (nullif(document->>'remainingQuantity', ''))::numeric,
  (nullif(document->>'timestamp', ''))::double precision,
  nullif(document->>'notes', ''),
  (nullif(document->>'expiryDate', ''))::double precision,
  nullif(document->>'brandName', ''),
  nullif(document->>'storeId', ''),
  nullif(document->>'purchaseUnit', ''),
  (nullif(document->>'purchaseQuantity', ''))::numeric,
  (nullif(document->>'lineTotal', ''))::numeric,
  nullif(document->>'sourceTransactionId', ''),
  nullif(document->>'sourceLabel', ''),
  nullif(document->>'sourceFingerprint', ''),
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'inventoryTransactions'
on conflict (source_id) do update
set
  inventory_source_id = excluded.inventory_source_id,
  quantity = excluded.quantity,
  tx_type = excluded.tx_type,
  cost_per_unit = excluded.cost_per_unit,
  remaining_quantity = excluded.remaining_quantity,
  tx_timestamp = excluded.tx_timestamp,
  notes = excluded.notes,
  expiry_date = excluded.expiry_date,
  brand_name = excluded.brand_name,
  store_source_id = excluded.store_source_id,
  purchase_unit = excluded.purchase_unit,
  purchase_quantity = excluded.purchase_quantity,
  line_total = excluded.line_total,
  source_transaction_id = excluded.source_transaction_id,
  source_label = excluded.source_label,
  source_fingerprint = excluded.source_fingerprint,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.orders (
  source_id,
  order_number,
  total_amount,
  status,
  payment_method,
  customer_name,
  table_number,
  order_type,
  source,
  brand_slug,
  guest_count,
  free_refill_selected,
  dessert_later,
  notes,
  created_at,
  voucher_source_id,
  discount_amount,
  tax_amount,
  service_charge_amount,
  receipt_meta,
  payment_receipt_kind,
  payment_gateway,
  gateway_invoice_id,
  creation_time,
  raw
)
select
  document_id,
  nullif(document->>'orderNumber', ''),
  coalesce((nullif(document->>'totalAmount', ''))::numeric, 0),
  nullif(document->>'status', ''),
  nullif(document->>'paymentMethod', ''),
  nullif(document->>'customerName', ''),
  nullif(document->>'tableNumber', ''),
  nullif(document->>'orderType', ''),
  nullif(document->>'source', ''),
  nullif(document->>'brandSlug', ''),
  (nullif(document->>'guestCount', ''))::integer,
  (nullif(document->>'freeRefillSelected', ''))::boolean,
  (nullif(document->>'dessertLater', ''))::boolean,
  nullif(document->>'notes', ''),
  (nullif(document->>'createdAt', ''))::double precision,
  nullif(document->>'voucherId', ''),
  (nullif(document->>'discountAmount', ''))::numeric,
  (nullif(document->>'taxAmount', ''))::numeric,
  (nullif(document->>'serviceChargeAmount', ''))::numeric,
  document->'receiptMeta',
  nullif(document->>'paymentReceiptKind', ''),
  document->'paymentGateway',
  nullif(document->>'gatewayInvoiceId', ''),
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'orders'
on conflict (source_id) do update
set
  order_number = excluded.order_number,
  total_amount = excluded.total_amount,
  status = excluded.status,
  payment_method = excluded.payment_method,
  customer_name = excluded.customer_name,
  table_number = excluded.table_number,
  order_type = excluded.order_type,
  source = excluded.source,
  brand_slug = excluded.brand_slug,
  guest_count = excluded.guest_count,
  free_refill_selected = excluded.free_refill_selected,
  dessert_later = excluded.dessert_later,
  notes = excluded.notes,
  created_at = excluded.created_at,
  voucher_source_id = excluded.voucher_source_id,
  discount_amount = excluded.discount_amount,
  tax_amount = excluded.tax_amount,
  service_charge_amount = excluded.service_charge_amount,
  receipt_meta = excluded.receipt_meta,
  payment_receipt_kind = excluded.payment_receipt_kind,
  payment_gateway = excluded.payment_gateway,
  gateway_invoice_id = excluded.gateway_invoice_id,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

delete from pos.order_items;

insert into pos.order_items (
  order_source_id,
  line_no,
  product_source_id,
  product_name,
  variant,
  quantity,
  price,
  original_price,
  status,
  hpp_snapshot,
  raw
)
select
  d.document_id,
  item.ordinality::integer,
  nullif(item.value->>'productId', ''),
  nullif(item.value->>'productName', ''),
  nullif(item.value->>'variant', ''),
  coalesce((nullif(item.value->>'quantity', ''))::numeric, 0),
  coalesce((nullif(item.value->>'price', ''))::numeric, 0),
  (nullif(item.value->>'originalPrice', ''))::numeric,
  nullif(item.value->>'status', ''),
  item.value->'hppSnapshot',
  item.value
from legacy_mirror.documents d
cross join lateral jsonb_array_elements(coalesce(d.document->'items', '[]'::jsonb)) with ordinality as item(value, ordinality)
where d.table_name = 'orders';

insert into pos.financial_transactions (
  source_id,
  tx_type,
  amount,
  category,
  merchant,
  description,
  tx_date,
  payment_method,
  status,
  order_source_id,
  booking_order_source_id,
  attachment_url,
  source_fingerprint,
  is_recurring,
  recurring_interval,
  tags,
  metadata,
  creation_time,
  raw
)
select
  document_id,
  coalesce(document->>'type', ''),
  coalesce((nullif(document->>'amount', ''))::numeric, 0),
  nullif(document->>'category', ''),
  nullif(document->>'merchant', ''),
  nullif(document->>'description', ''),
  (nullif(document->>'date', ''))::double precision,
  nullif(document->>'paymentMethod', ''),
  nullif(document->>'status', ''),
  nullif(document->>'orderId', ''),
  nullif(document->>'bookingOrderId', ''),
  nullif(document->>'attachmentUrl', ''),
  nullif(document->>'sourceFingerprint', ''),
  (nullif(document->>'isRecurring', ''))::boolean,
  nullif(document->>'recurringInterval', ''),
  document->'tags',
  document->'metadata',
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'financialTransactions'
on conflict (source_id) do update
set
  tx_type = excluded.tx_type,
  amount = excluded.amount,
  category = excluded.category,
  merchant = excluded.merchant,
  description = excluded.description,
  tx_date = excluded.tx_date,
  payment_method = excluded.payment_method,
  status = excluded.status,
  order_source_id = excluded.order_source_id,
  booking_order_source_id = excluded.booking_order_source_id,
  attachment_url = excluded.attachment_url,
  source_fingerprint = excluded.source_fingerprint,
  is_recurring = excluded.is_recurring,
  recurring_interval = excluded.recurring_interval,
  tags = excluded.tags,
  metadata = excluded.metadata,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.discounts (
  source_id,
  name,
  code,
  discount_type,
  value,
  target_type,
  target_id,
  target_ids,
  formatted_id,
  is_active,
  min_order_value,
  start_date,
  end_date,
  start_time,
  end_time,
  days,
  is_happy_hour,
  product_prices,
  is_free_refill,
  refill_price,
  refill_availability,
  creation_time,
  raw
)
select
  document_id,
  coalesce(document->>'name', ''),
  nullif(document->>'code', ''),
  nullif(document->>'type', ''),
  coalesce((nullif(document->>'value', ''))::numeric, 0),
  nullif(document->>'targetType', ''),
  nullif(document->>'targetId', ''),
  document->'targetIds',
  nullif(document->>'formattedId', ''),
  coalesce((nullif(document->>'isActive', ''))::boolean, false),
  (nullif(document->>'minOrderValue', ''))::numeric,
  (nullif(document->>'startDate', ''))::double precision,
  (nullif(document->>'endDate', ''))::double precision,
  nullif(document->>'startTime', ''),
  nullif(document->>'endTime', ''),
  document->'days',
  (nullif(document->>'isHappyHour', ''))::boolean,
  document->'productPrices',
  (nullif(document->>'isFreeRefill', ''))::boolean,
  (nullif(document->>'refillPrice', ''))::numeric,
  nullif(document->>'refillAvailability', ''),
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'discounts'
on conflict (source_id) do update
set
  name = excluded.name,
  code = excluded.code,
  discount_type = excluded.discount_type,
  value = excluded.value,
  target_type = excluded.target_type,
  target_id = excluded.target_id,
  target_ids = excluded.target_ids,
  formatted_id = excluded.formatted_id,
  is_active = excluded.is_active,
  min_order_value = excluded.min_order_value,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  days = excluded.days,
  is_happy_hour = excluded.is_happy_hour,
  product_prices = excluded.product_prices,
  is_free_refill = excluded.is_free_refill,
  refill_price = excluded.refill_price,
  refill_availability = excluded.refill_availability,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.site_settings (
  source_id,
  store_name,
  store_address,
  store_phone,
  app_name,
  app_version,
  tax_rate,
  service_charge_rate,
  creation_time,
  raw
)
select
  document_id,
  nullif(document->>'storeName', ''),
  nullif(document->>'storeAddress', ''),
  nullif(document->>'storePhone', ''),
  nullif(document->>'appName', ''),
  nullif(document->>'appVersion', ''),
  (nullif(document->>'taxRate', ''))::numeric,
  (nullif(document->>'serviceChargeRate', ''))::numeric,
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'siteSettings'
on conflict (source_id) do update
set
  store_name = excluded.store_name,
  store_address = excluded.store_address,
  store_phone = excluded.store_phone,
  app_name = excluded.app_name,
  app_version = excluded.app_version,
  tax_rate = excluded.tax_rate,
  service_charge_rate = excluded.service_charge_rate,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

