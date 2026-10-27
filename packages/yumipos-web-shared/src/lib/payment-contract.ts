export type CanonicalPaymentMethod = "cashier_cash" | "qris_mayar" | "djiwa_pay";

export const PAYMENT_METHOD_LABELS: Record<CanonicalPaymentMethod, string> = {
  cashier_cash: "Bayar Tunai di Kasir",
  qris_mayar: "QRIS",
  djiwa_pay: "Djiwa Pay",
};

type PaymentInput = {
  paymentMethod?: unknown;
  paymentReceiptKind?: unknown;
  paymentGateway?: unknown;
};

const normalize = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const hasValue = (value: unknown): boolean => {
  if (value == null || value === "") return false;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
};

/** Resolve legacy persisted values into the one payment vocabulary used by all apps. */
export function normalizePaymentMethod(input: PaymentInput): CanonicalPaymentMethod | "unknown" {
  const method = normalize(input.paymentMethod);
  const receiptKind = normalize(input.paymentReceiptKind);
  const gateway = normalize(input.paymentGateway);

  // Explicit QRIS/gateway provenance wins over stale cashier receipt metadata.
  if (
    ["qris", "qris_mayar", "mayar", "gateway"].includes(method) ||
    ["gateway", "gateway_pending", "gateway_paid", "mayar", "qris", "qris_mayar"].includes(receiptKind) ||
    ["mayar", "gateway", "qris"].includes(gateway) ||
    (method === "djiwaapp" && hasValue(input.paymentGateway))
  ) {
    return "qris_mayar";
  }

  if (
    ["wallet", "djiwa_pay", "djiwaapp_wallet", "djiwa_pay_wallet"].includes(method) ||
    ["wallet", "wallet_pending", "wallet_paid", "djiwa_pay"].includes(receiptKind)
  ) {
    return "djiwa_pay";
  }

  if (
    ["cash", "tunai", "cashier", "cashier_cash"].includes(method) ||
    ["cashier", "cashier_pending"].includes(receiptKind)
  ) {
    return "cashier_cash";
  }

  return "unknown";
}

export type PaymentSettlementState = "pending" | "paid" | "completed" | "cancelled" | "failed";

/** Persist the same receipt-kind family regardless of which app created the order. */
export function paymentReceiptKindFor(
  method: CanonicalPaymentMethod,
  state: PaymentSettlementState,
): string {
  if (method === "cashier_cash") return state === "pending" ? "cashier_pending" : "cashier";
  if (method === "qris_mayar") return state === "pending" ? "gateway_pending" : "gateway";
  if (method === "djiwa_pay") return state === "pending" ? "wallet_pending" : "wallet";
  return "unknown";
}

