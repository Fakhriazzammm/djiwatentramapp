import "dotenv/config";
import process from "node:process";
import { Client } from "pg";

function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function int(v) {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

function bool(v) {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}

function str(v) {
  if (v === null || v === undefined) return null;
  return String(v);
}

async function loadTableDocs(client, tableName) {
  const { rows } = await client.query(
    `select document_id, creation_time, document from legacy_mirror.documents where table_name = $1`,
    [tableName]
  );
  return rows;
}

async function upsertCategories(client, docs) {
  let count = 0;
  for (const row of docs) {
    const d = row.document;
    await client.query(
      `insert into pos.categories
      (source_id, name, display_order, parent_source_id, track, creation_time, raw)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb)
      on conflict (source_id) do update
      set name = excluded.name,
          display_order = excluded.display_order,
          parent_source_id = excluded.parent_source_id,
          track = excluded.track,
          creation_time = excluded.creation_time,
          raw = excluded.raw`,
      [
        row.document_id,
        str(d.name) ?? "",
        int(d.order) ?? 0,
        str(d.parentId),
        str(d.track),
        row.creation_time,
        JSON.stringify(d),
      ]
    );
    count += 1;
  }
  return count;
}

async function upsertProducts(client, docs) {
  let count = 0;
  for (const row of docs) {
    const d = row.document;
    await client.query(
      `insert into pos.products
      (source_id, category_source_id, name, description, price, promo_price, image, is_available, quantity, menu_number, variations, creation_time, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb)
      on conflict (source_id) do update
      set category_source_id = excluded.category_source_id,
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
          raw = excluded.raw`,
      [
        row.document_id,
        str(d.categoryId),
        str(d.name) ?? "",
        str(d.description),
        num(d.price) ?? 0,
        num(d.promoPrice),
        str(d.image),
        bool(d.isAvailable) ?? true,
        num(d.quantity),
        int(d.menuNumber),
        JSON.stringify(d.variations ?? null),
        row.creation_time,
        JSON.stringify(d),
      ]
    );
    count += 1;
  }
  return count;
}

async function upsertInventory(client, docs) {
  let count = 0;
  for (const row of docs) {
    const d = row.document;
    await client.query(
      `insert into pos.inventory
      (source_id, ingredient_name, unit, quantity, low_stock_threshold, display_unit, conversion_factor, unit_conversions, base_recipe_source_id, default_brand_name, preferred_store_source_id, preferred_purchase_quantity, preferred_purchase_unit, aliases, last_purchase_price, last_purchase_at, last_purchase_store_source_id, creation_time, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19::jsonb)
      on conflict (source_id) do update
      set ingredient_name = excluded.ingredient_name,
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
          raw = excluded.raw`,
      [
        row.document_id,
        str(d.ingredientName) ?? "",
        str(d.unit) ?? "",
        num(d.quantity) ?? 0,
        num(d.lowStockThreshold) ?? 0,
        str(d.displayUnit),
        num(d.conversionFactor),
        JSON.stringify(d.unitConversions ?? null),
        str(d.baseRecipeId),
        str(d.defaultBrandName),
        str(d.preferredStoreId),
        num(d.preferredPurchaseQuantity),
        str(d.preferredPurchaseUnit),
        JSON.stringify(d.aliases ?? null),
        num(d.lastPurchasePrice),
        num(d.lastPurchaseAt),
        str(d.lastPurchaseStoreId),
        row.creation_time,
        JSON.stringify(d),
      ]
    );
    count += 1;
  }
  return count;
}

async function upsertInventoryTransactions(client, docs) {
  let count = 0;
  for (const row of docs) {
    const d = row.document;
    await client.query(
      `insert into pos.inventory_transactions
      (source_id, inventory_source_id, quantity, tx_type, cost_per_unit, remaining_quantity, tx_timestamp, notes, expiry_date, brand_name, store_source_id, purchase_unit, purchase_quantity, line_total, source_transaction_id, source_label, source_fingerprint, creation_time, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)
      on conflict (source_id) do update
      set inventory_source_id = excluded.inventory_source_id,
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
          raw = excluded.raw`,
      [
        row.document_id,
        str(d.inventoryId) ?? "",
        num(d.quantity) ?? 0,
        str(d.type) ?? "",
        num(d.costPerUnit),
        num(d.remainingQuantity),
        num(d.timestamp),
        str(d.notes),
        num(d.expiryDate),
        str(d.brandName),
        str(d.storeId),
        str(d.purchaseUnit),
        num(d.purchaseQuantity),
        num(d.lineTotal),
        str(d.sourceTransactionId),
        str(d.sourceLabel),
        str(d.sourceFingerprint),
        row.creation_time,
        JSON.stringify(d),
      ]
    );
    count += 1;
  }
  return count;
}

async function upsertOrders(client, docs) {
  let count = 0;
  for (const row of docs) {
    const d = row.document;
    await client.query(
      `insert into pos.orders
      (source_id, order_number, total_amount, status, payment_method, customer_name, table_number, order_type, source, brand_slug, guest_count, free_refill_selected, dessert_later, notes, created_at, voucher_source_id, discount_amount, tax_amount, service_charge_amount, receipt_meta, payment_receipt_kind, payment_gateway, gateway_invoice_id, creation_time, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22::jsonb,$23,$24,$25::jsonb)
      on conflict (source_id) do update
      set order_number = excluded.order_number,
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
          raw = excluded.raw`,
      [
        row.document_id,
        str(d.orderNumber),
        num(d.totalAmount) ?? 0,
        str(d.status),
        str(d.paymentMethod),
        str(d.customerName),
        str(d.tableNumber),
        str(d.orderType),
        str(d.source),
        str(d.brandSlug),
        int(d.guestCount),
        bool(d.freeRefillSelected),
        bool(d.dessertLater),
        str(d.notes),
        num(d.createdAt),
        str(d.voucherId),
        num(d.discountAmount),
        num(d.taxAmount),
        num(d.serviceChargeAmount),
        JSON.stringify(d.receiptMeta ?? null),
        str(d.paymentReceiptKind),
        JSON.stringify(d.paymentGateway ?? null),
        str(d.gatewayInvoiceId),
        row.creation_time,
        JSON.stringify(d),
      ]
    );
    count += 1;
  }
  return count;
}

async function replaceOrderItems(client, docs) {
  let count = 0;
  for (const row of docs) {
    const d = row.document;
    const items = Array.isArray(d.items) ? d.items : [];
    await client.query(`delete from pos.order_items where order_source_id = $1`, [row.document_id]);
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      await client.query(
        `insert into pos.order_items
        (order_source_id, line_no, product_source_id, product_name, variant, quantity, price, original_price, status, hpp_snapshot, raw)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
        on conflict (order_source_id, line_no) do update
        set product_source_id = excluded.product_source_id,
            product_name = excluded.product_name,
            variant = excluded.variant,
            quantity = excluded.quantity,
            price = excluded.price,
            original_price = excluded.original_price,
            status = excluded.status,
            hpp_snapshot = excluded.hpp_snapshot,
            raw = excluded.raw`,
        [
          row.document_id,
          i + 1,
          str(item.productId),
          str(item.productName),
          str(item.variant),
          num(item.quantity) ?? 0,
          num(item.price) ?? 0,
          num(item.originalPrice),
          str(item.status),
          JSON.stringify(item.hppSnapshot ?? null),
          JSON.stringify(item),
        ]
      );
      count += 1;
    }
  }
  return count;
}

async function upsertFinancialTransactions(client, docs) {
  let count = 0;
  for (const row of docs) {
    const d = row.document;
    await client.query(
      `insert into pos.financial_transactions
      (source_id, tx_type, amount, category, merchant, description, tx_date, payment_method, status, order_source_id, booking_order_source_id, attachment_url, source_fingerprint, is_recurring, recurring_interval, tags, metadata, creation_time, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19::jsonb)
      on conflict (source_id) do update
      set tx_type = excluded.tx_type,
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
          raw = excluded.raw`,
      [
        row.document_id,
        str(d.type) ?? "",
        num(d.amount) ?? 0,
        str(d.category),
        str(d.merchant),
        str(d.description),
        num(d.date),
        str(d.paymentMethod),
        str(d.status),
        str(d.orderId),
        str(d.bookingOrderId),
        str(d.attachmentUrl),
        str(d.sourceFingerprint),
        bool(d.isRecurring),
        str(d.recurringInterval),
        JSON.stringify(d.tags ?? null),
        JSON.stringify(d.metadata ?? null),
        row.creation_time,
        JSON.stringify(d),
      ]
    );
    count += 1;
  }
  return count;
}

async function upsertDiscounts(client, docs) {
  let count = 0;
  for (const row of docs) {
    const d = row.document;
    await client.query(
      `insert into pos.discounts
      (source_id, name, code, discount_type, value, target_type, target_id, target_ids, formatted_id, is_active, min_order_value, start_date, end_date, start_time, end_time, days, is_happy_hour, product_prices, is_free_refill, refill_price, refill_availability, creation_time, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18::jsonb,$19,$20,$21,$22,$23::jsonb)
      on conflict (source_id) do update
      set name = excluded.name,
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
          raw = excluded.raw`,
      [
        row.document_id,
        str(d.name) ?? "",
        str(d.code),
        str(d.type),
        num(d.value) ?? 0,
        str(d.targetType),
        str(d.targetId),
        JSON.stringify(d.targetIds ?? null),
        str(d.formattedId),
        bool(d.isActive) ?? false,
        num(d.minOrderValue),
        num(d.startDate),
        num(d.endDate),
        str(d.startTime),
        str(d.endTime),
        JSON.stringify(d.days ?? null),
        bool(d.isHappyHour),
        JSON.stringify(d.productPrices ?? null),
        bool(d.isFreeRefill),
        num(d.refillPrice),
        str(d.refillAvailability),
        row.creation_time,
        JSON.stringify(d),
      ]
    );
    count += 1;
  }
  return count;
}

async function upsertSiteSettings(client, docs) {
  let count = 0;
  for (const row of docs) {
    const d = row.document;
    await client.query(
      `insert into pos.site_settings
      (source_id, store_name, store_address, store_phone, app_name, app_version, tax_rate, service_charge_rate, creation_time, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      on conflict (source_id) do update
      set store_name = excluded.store_name,
          store_address = excluded.store_address,
          store_phone = excluded.store_phone,
          app_name = excluded.app_name,
          app_version = excluded.app_version,
          tax_rate = excluded.tax_rate,
          service_charge_rate = excluded.service_charge_rate,
          creation_time = excluded.creation_time,
          raw = excluded.raw`,
      [
        row.document_id,
        str(d.storeName),
        str(d.storeAddress),
        str(d.storePhone),
        str(d.appName),
        str(d.appVersion),
        num(d.taxRate),
        num(d.serviceChargeRate),
        row.creation_time,
        JSON.stringify(d),
      ]
    );
    count += 1;
  }
  return count;
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const run = await client.query(
    `insert into pos.migration_runs (source) values ('legacy_mirror') returning id`
  );
  const runId = run.rows[0].id;
  let upserted = 0;

  try {
    const categories = await loadTableDocs(client, "categories");
    const products = await loadTableDocs(client, "products");
    const inventory = await loadTableDocs(client, "inventory");
    const inventoryTx = await loadTableDocs(client, "inventoryTransactions");
    const orders = await loadTableDocs(client, "orders");
    const financialTx = await loadTableDocs(client, "financialTransactions");
    const discounts = await loadTableDocs(client, "discounts");
    const siteSettings = await loadTableDocs(client, "siteSettings");

    upserted += await upsertCategories(client, categories);
    upserted += await upsertProducts(client, products);
    upserted += await upsertInventory(client, inventory);
    upserted += await upsertInventoryTransactions(client, inventoryTx);
    upserted += await upsertOrders(client, orders);
    upserted += await replaceOrderItems(client, orders);
    upserted += await upsertFinancialTransactions(client, financialTx);
    upserted += await upsertDiscounts(client, discounts);
    upserted += await upsertSiteSettings(client, siteSettings);

    await client.query(
      `update pos.migration_runs set finished_at = now(), upserted_count = $2 where id = $1`,
      [runId, upserted]
    );

    console.log(`Core transform completed. upserted=${upserted}`);
  } catch (error) {
    await client.query(
      `update pos.migration_runs set finished_at = now(), failed_count = 1, notes = $2 where id = $1`,
      [runId, String(error?.message ?? error)]
    );
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Core transform failed:", error);
  process.exitCode = 1;
});

