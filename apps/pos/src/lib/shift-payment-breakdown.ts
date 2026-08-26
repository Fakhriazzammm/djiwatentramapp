export const SHIFT_PAYMENT_CHANNELS = [
  { key: "qris_kasir", label: "QRIS Kasir", group: "direct" },
  { key: "tunai_kasir", label: "Tunai Kasir", group: "direct" },
  { key: "djiwa_pay", label: "Djiwa Pay", group: "direct" },
  { key: "djiwaapp_qris", label: "Djiwa App - QRIS", group: "direct" },
  { key: "djiwaapp_bayar_kasir", label: "Djiwa App - Bayar Tunai di Kasir", group: "direct" },
  { key: "gofood", label: "GoFood", group: "online" },
  { key: "grabfood", label: "GrabFood", group: "online" },
  { key: "shopeefood", label: "ShopeeFood", group: "online" },
  { key: "online_unmapped", label: "Online Food — Platform Belum Terpetakan", group: "online" },
] as const;

export type ShiftPaymentChannelKey = (typeof SHIFT_PAYMENT_CHANNELS)[number]["key"];
export type ShiftPaymentBreakdown = Record<ShiftPaymentChannelKey, number>;

export const EMPTY_SHIFT_PAYMENT_BREAKDOWN: ShiftPaymentBreakdown = {
  qris_kasir: 0,
  tunai_kasir: 0,
  djiwa_pay: 0,
  djiwaapp_qris: 0,
  djiwaapp_bayar_kasir: 0,
  gofood: 0,
  grabfood: 0,
  shopeefood: 0,
  online_unmapped: 0,
};

export const EMPTY_SHIFT_PAYMENT_ACTUAL: Partial<Record<ShiftPaymentChannelKey, number | null>> = {
  qris_kasir: null,
  tunai_kasir: null,
  djiwa_pay: null,
  djiwaapp_qris: null,
  djiwaapp_bayar_kasir: null,
  gofood: null,
  grabfood: null,
  shopeefood: null,
  online_unmapped: null,
};

const ONLINE_PLATFORM_KEYS: Record<string, ShiftPaymentChannelKey> = {
  gofood: "gofood",
  go_food: "gofood",
  grab: "grabfood",
  grabfood: "grabfood",
  grab_food: "grabfood",
  shopee: "shopeefood",
  shopeefood: "shopeefood",
  shopee_food: "shopeefood",
};

export function classifyShiftPaymentChannel(order: Record<string, any>): ShiftPaymentChannelKey | null {
  const source = String(order.source ?? "").trim().toLowerCase();
  const method = String(order.paymentMethod ?? order.payment_method ?? "").trim().toLowerCase();
  const receiptKind = String(order.paymentReceiptKind ?? order.payment_receipt_kind ?? "").trim().toLowerCase();
  const orderType = String(order.orderType ?? order.order_type ?? "").trim().toLowerCase();
  const raw = order.raw && typeof order.raw === "object" ? order.raw : {};
  const paymentChoice = String(raw.paymentChoice ?? raw.payment_choice ?? "").trim().toLowerCase();
  const receiptMeta = order.receiptMeta && typeof order.receiptMeta === "object" ? order.receiptMeta : {};
  const platform = String(order.platform ?? receiptMeta.platform ?? raw.platform ?? raw.orderPlatform ?? "").trim().toLowerCase();
  const amount = Number(order.totalAmount ?? order.total_amount ?? 0);

  if (amount <= 0) return null;
  const onlineKey = ONLINE_PLATFORM_KEYS[platform];
  if (orderType === "online") return onlineKey ?? "online_unmapped";

  if (source === "customer_self_service") {
    if (paymentChoice === "cashier" || ["cash", "tunai", "cashier"].includes(method) || receiptKind === "cashier") {
      return "djiwaapp_bayar_kasir";
    }
    if (paymentChoice === "wallet" || ["wallet", "djiwa_pay"].includes(method) || receiptKind.startsWith("wallet")) {
      return "djiwa_pay";
    }
    if (paymentChoice === "mayar" || ["djiwaapp", "qris"].includes(method) || receiptKind === "gateway_paid") {
      return "djiwaapp_qris";
    }
    return null;
  }

  if (["wallet", "djiwa_pay"].includes(method)) return "djiwa_pay";
  if (["cash", "tunai"].includes(method)) return "tunai_kasir";
  if (["qris", "edc", "transfer"].includes(method)) return "qris_kasir";
  return null;
}

export function calculateShiftPaymentBreakdown(orders: Array<Record<string, any>>): ShiftPaymentBreakdown {
  const result = { ...EMPTY_SHIFT_PAYMENT_BREAKDOWN };
  for (const order of orders) {
    if (!["paid", "completed"].includes(String(order.status ?? "").toLowerCase())) continue;
    const channel = classifyShiftPaymentChannel(order);
    if (channel) result[channel] += Number(order.totalAmount ?? order.total_amount ?? 0);
  }
  return result;
}

export function calculateBreakdownTotal(breakdown: Record<string, number>): number {
  return Object.entries(breakdown).reduce(
    (sum, [key, count]) => sum + Number(key.replace("bill", "")) * Number(count || 0),
    0,
  );
}

export function formatShiftPaymentChannelLabel(key: string): string {
  return SHIFT_PAYMENT_CHANNELS.find((channel) => channel.key === key)?.label ?? key;
}
