export type PaymentLabelInput = {
  source?: string | null;
  paymentMethod?: string | null;
  paymentReceiptKind?: string | null;
  paymentGateway?: unknown;
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** Maps persisted provenance into a human-readable business label. */
export function formatPaymentLabel(
  input: PaymentLabelInput,
  options: { includeAppPrefix?: boolean } = {},
): string {
  const source = normalize(input.source);
  const method = normalize(input.paymentMethod);
  const receiptKind = normalize(input.paymentReceiptKind);
  const includeAppPrefix = options.includeAppPrefix ?? source === "customer_self_service";
  const isDjiwaApp = source === "customer_self_service";

  let methodLabel: string;
  if (method === "cash" || method === "tunai" || receiptKind === "cashier_pending" || receiptKind === "cashier") {
    methodLabel = "Bayar Tunai di Kasir";
  } else if (method === "wallet" || method === "djiwa_pay") {
    methodLabel = "Djiwa Pay";
  } else if (method === "qris" || method === "qris_mayar" || method === "mayar" || method === "djiwaapp" && input.paymentGateway) {
    methodLabel = "QRIS";
  } else if (method === "djiwaapp") {
    methodLabel = "Metode pembayaran lama";
  } else if (method === "transfer" || method === "bank_transfer") {
    methodLabel = "Transfer Bank";
  } else if (method === "edc" || method === "debit" || method === "credit") {
    methodLabel = "EDC";
  } else {
    methodLabel = method ? method.toUpperCase() : "Metode pembayaran tidak diketahui";
  }

  return includeAppPrefix && isDjiwaApp ? `Djiwa App - ${methodLabel}` : methodLabel;
}

export function isCustomerSelfServiceSource(source?: string | null): boolean {
  return normalize(source) === "customer_self_service";
}
