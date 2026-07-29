type AnyArgs = Record<string, any>;

export function extractPublicHomePin(raw: unknown) {
  if (!raw || typeof raw !== "object") return "";
  const candidate = (raw as Record<string, unknown>).homePin;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function mapOrderItems(items: unknown) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    productId: item?.productId ?? null,
    productName: item?.productName ?? null,
    quantity: Number(item?.quantity ?? 0),
    price: Number(item?.price ?? 0),
    variant: item?.variant ?? null,
    originalPrice:
      item?.originalPrice === undefined ? null : Number(item?.originalPrice ?? 0),
    status: item?.status ?? null,
    hppSnapshot: item?.hppSnapshot ?? null,
  }));
}

export function buildPublicOrderRow(args: {
  args: AnyArgs;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: number;
  status: "pending" | "paid" | "completed" | "cancelled";
}) {
  const payload = args.args ?? {};

  return {
    _id: args.orderId,
    _creationTime: args.orderCreatedAt,
    orderNumber: args.orderNumber,
    totalAmount: Number(payload.totalAmount ?? 0),
    status: args.status,
    paymentMethod: payload.paymentMethod ?? null,
    customerName: payload.customerName ?? null,
    tableNumber: payload.tableNumber ?? null,
    orderType: payload.orderType ?? null,
    source: payload.source ?? null,
    brandSlug: payload.brandSlug ?? null,
    guestCount:
      payload.guestCount === undefined ? null : Number(payload.guestCount ?? 0),
    freeRefillSelected:
      payload.freeRefillSelected === undefined
        ? null
        : Boolean(payload.freeRefillSelected),
    dessertLater:
      payload.dessertLater === undefined ? null : Boolean(payload.dessertLater),
    notes: payload.notes ?? null,
    createdAt: args.orderCreatedAt,
    voucherId: payload.voucherId ?? null,
    discountAmount:
      payload.discountAmount === undefined ? null : Number(payload.discountAmount ?? 0),
    taxAmount: payload.taxAmount === undefined ? null : Number(payload.taxAmount ?? 0),
    serviceChargeAmount:
      payload.serviceChargeAmount === undefined
        ? null
        : Number(payload.serviceChargeAmount ?? 0),
    receiptMeta: payload.receiptMeta ?? null,
    paymentReceiptKind: payload.paymentReceiptKind ?? null,
    paymentGateway: payload.paymentGateway ?? null,
    gatewayInvoiceId: payload.paymentGateway?.invoiceId ?? null,
    authUserId: payload.authUserId ?? null,
    items: mapOrderItems(payload.items),
  };
}

export function buildPublicOrderSettlementTransaction(args: {
  args: AnyArgs;
  orderId: string;
  orderNumber: string;
  transactionId: string;
  transactionDate: number;
}) {
  const payload = args.args ?? {};

  return {
    _id: args.transactionId,
    type: "income",
    amount: Number(payload.totalAmount ?? 0),
    category: "Penjualan",
    merchant: null,
    description: `Penjualan Pesanan #${args.orderNumber}`,
    date: args.transactionDate,
    paymentMethod: payload.paymentMethod ?? null,
    status: "completed",
    orderId: args.orderId,
    bookingOrderId: null,
    attachmentUrl: null,
    sourceFingerprint: null,
    isRecurring: false,
    recurringInterval: null,
    tags: [],
    metadata: {
      kind: "order_settlement",
      orderId: args.orderId,
    },
  };
}

export function buildPublicShiftRow(args: {
  args: AnyArgs;
  shiftId: string;
  startTime: number;
}) {
  const payload = args.args ?? {};

  return {
    _id: args.shiftId,
    shiftName: payload.shiftName ?? "Shift",
    cashierName: payload.cashierName ?? null,
    teamMembers: payload.teamMembers ?? null,
    startTime: args.startTime,
    endTime: null,
    startingCash: Number(payload.startingCash ?? 0),
    notes: payload.notes ?? null,
    summary: null,
    cashBreakdown: null,
    nonCashExpected: null,
    nonCashConfirmed: null,
    endingCashExpected: null,
    endingCashPhysical: null,
    raw: payload,
  };
}

export function buildPublicShiftStartTransaction(args: {
  args: AnyArgs;
  shiftId: string;
  transactionId: string;
  startTime: number;
  metadata?: Record<string, any>;
}) {
  const payload = args.args ?? {};
  const descParts = [
    `Kasir: ${payload.cashierName ?? "-"}`,
    `Shift: ${payload.shiftName ?? "-"}`,
  ];
  if (payload.teamMembers) descParts.push(`Tim: ${payload.teamMembers}`);
  if (payload.notes) descParts.push(`Catatan: ${payload.notes}`);

  return {
    _id: args.transactionId,
    type: "income",
    amount: Number(payload.startingCash ?? 0),
    category: "Modal Awal",
    merchant: null,
    description: descParts.join(" | "),
    date: args.startTime,
    paymentMethod: "tunai",
    status: "completed",
    orderId: null,
    bookingOrderId: null,
    attachmentUrl: null,
    sourceFingerprint: null,
    isRecurring: false,
    recurringInterval: null,
    tags: [],
    metadata: args.metadata ?? null,
  };
}

export function buildPublicAttendanceLog(args: {
  id: string;
  type: "check_in" | "check_out";
  timestamp: number;
  payload: AnyArgs;
}) {
  const payload = args.payload ?? {};

  return {
    _id: args.id,
    _creationTime: args.timestamp,
    userId: payload.userId,
    type: args.type,
    timestamp: args.timestamp,
    photoUrl: payload.photoUrl ?? null,
    location: payload.location ?? null,
    notes: payload.notes ?? null,
    shiftName: payload.shiftName ?? null,
    shiftOpenTimeSnapshot: payload.shiftOpenTimeSnapshot ?? null,
    raw: payload,
  };
}
