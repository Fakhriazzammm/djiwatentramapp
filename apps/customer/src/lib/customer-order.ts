export type CustomerOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  image?: string | null;
  variant?: string | null;
  status?: string | null;
};

export type CustomerOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  discountAmount?: number;
  taxAmount?: number;
  serviceChargeAmount?: number;
  paymentReceiptKind?: string | null;
  receiptMeta?: Record<string, unknown> | null;
  paymentMethod: string | null;
  paymentStatus?: string | null;
  paymentGateway?: Record<string, unknown> | null;
  gatewayInvoiceId?: string | null;
  source?: string | null;
  sourceApp?: string | null;
  businessUnit?: string | null;
  brandSlug?: string | null;
  platform?: string | null;
  dailyReceiptNo?: number | null;
  orderType: string | null;
  tableNumber: string | null;
  deliveryStatus?: string | null;
  deliveryProvider?: string | null;
  deliveryAddress?: string | null;
  deliveryDate?: string | null;
  customerName?: string | null;
  customerDescription?: string | null;
  notes?: string | null;
  items: CustomerOrderItem[];
  createdAt: number;
  trackingStatus?: string | null;
  paymentDeadlineAt?: string | null;
  estimatedReadyAt?: string | null;
  slaStartedAt?: string | null;
  slaDeadlineAt?: string | null;
  isLate?: boolean;
  lateMinutes?: number;
  trackingGroupCount?: number;
  trackingFinishedGroupCount?: number;
  trackingGroups?: Array<{
    groupType: string;
    status: string;
    completedAt?: string | null;
    updatedAt?: string | null;
  }>;
};

function nullableString(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    return String(value);
  }
  return null;
}

function numberValue(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function timestampValue(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return 0;
}

function objectValue(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return null;
}

export function mapCustomerOrder(row: Record<string, unknown>): CustomerOrder {
  const rawItems = Array.isArray(row.items) ? row.items : [];
  const trackingGroups = row.trackingGroups ?? row.tracking_groups;

  return {
    id: String(row._id ?? row.source_id ?? row.id ?? ""),
    orderNumber: String(row.orderNumber ?? row.order_number ?? ""),
    status: String(row.status ?? ""),
    totalAmount: numberValue(row, "totalAmount", "total_amount"),
    discountAmount: numberValue(row, "discountAmount", "discount_amount"),
    taxAmount: numberValue(row, "taxAmount", "tax_amount"),
    serviceChargeAmount: numberValue(row, "serviceChargeAmount", "service_charge_amount"),
    paymentReceiptKind: nullableString(row, "paymentReceiptKind", "payment_receipt_kind"),
    receiptMeta: objectValue(row, "receiptMeta", "receipt_meta"),
    paymentMethod: nullableString(row, "paymentMethod", "payment_method"),
    paymentStatus: nullableString(row, "paymentStatus", "payment_status"),
    paymentGateway: objectValue(row, "paymentGateway", "payment_gateway"),
    gatewayInvoiceId: nullableString(row, "gatewayInvoiceId", "gateway_invoice_id"),
    source: nullableString(row, "source"),
    sourceApp: nullableString(row, "sourceApp", "source_app"),
    businessUnit: nullableString(row, "businessUnit", "business_unit"),
    brandSlug: nullableString(row, "brandSlug", "brand_slug"),
    platform: nullableString(row, "platform"),
    dailyReceiptNo: row.dailyReceiptNo == null && row.daily_receipt_no == null
      ? null
      : numberValue(row, "dailyReceiptNo", "daily_receipt_no"),
    orderType: nullableString(row, "orderType", "order_type"),
    tableNumber: nullableString(row, "tableNumber", "table_number"),
    deliveryStatus: nullableString(row, "deliveryStatus", "delivery_status"),
    deliveryProvider: nullableString(row, "deliveryProvider", "delivery_provider"),
    deliveryAddress: nullableString(row, "deliveryAddress", "delivery_address"),
    deliveryDate: nullableString(row, "deliveryDate", "delivery_date"),
    customerName: nullableString(row, "customerName", "customer_name"),
    customerDescription: nullableString(row, "customerDescription", "customer_description"),
    notes: nullableString(row, "notes", "note"),
    items: rawItems.map((item) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        productId: String(value.productId ?? value.product_id ?? ""),
        productName: String(value.productName ?? value.product_name ?? ""),
        quantity: numberValue(value, "quantity"),
        price: numberValue(value, "price"),
        originalPrice: value.originalPrice == null && value.original_price == null
          ? undefined
          : numberValue(value, "originalPrice", "original_price"),
        image: nullableString(value, "image", "imageUrl", "image_url"),
        variant: nullableString(value, "variant"),
        status: nullableString(value, "status"),
      };
    }),
    createdAt: timestampValue(row, "createdAt", "created_at", "_creationTime"),
    trackingStatus: nullableString(row, "trackingStatus", "tracking_status"),
    paymentDeadlineAt: nullableString(row, "paymentDeadlineAt", "payment_deadline_at"),
    estimatedReadyAt: nullableString(row, "estimatedReadyAt", "estimated_ready_at"),
    slaStartedAt: nullableString(row, "slaStartedAt", "sla_started_at"),
    slaDeadlineAt: nullableString(row, "slaDeadlineAt", "sla_deadline_at"),
    isLate: Boolean(row.isLate ?? row.is_late ?? false),
    lateMinutes: numberValue(row, "lateMinutes", "late_minutes"),
    trackingGroupCount: numberValue(row, "trackingGroupCount", "tracking_group_count"),
    trackingFinishedGroupCount: numberValue(row, "trackingFinishedGroupCount", "tracking_finished_group_count"),
    trackingGroups: Array.isArray(trackingGroups) ? trackingGroups as CustomerOrder["trackingGroups"] : [],
  };
}
