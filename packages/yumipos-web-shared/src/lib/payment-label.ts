import { normalizePaymentMethod, PAYMENT_METHOD_LABELS } from "./payment-contract";

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
  const includeAppPrefix = options.includeAppPrefix ?? source === "customer_self_service";
  const isDjiwaApp = source === "customer_self_service";
  const isMieYamin = source === "ordermieyamin_b2b";

  let methodLabel: string;
  const canonical = normalizePaymentMethod(input);
  if (canonical !== "unknown" && !(isMieYamin && canonical === "djiwa_pay")) {
    methodLabel = PAYMENT_METHOD_LABELS[canonical];
  } else if (isMieYamin && ["djiwaapp", "qris", "qris_mayar", "mayar"].includes(normalize(input.paymentMethod))) {
    methodLabel = "QRIS";
  } else if (normalize(input.paymentMethod) === "djiwaapp") {
    methodLabel = "Metode pembayaran lama";
  } else if (["transfer", "bank_transfer"].includes(normalize(input.paymentMethod))) {
    methodLabel = "Transfer Bank";
  } else if (["edc", "debit", "credit"].includes(normalize(input.paymentMethod))) {
    methodLabel = "EDC";
  } else {
    const method = normalize(input.paymentMethod);
    methodLabel = method ? method.toUpperCase() : "Metode pembayaran tidak diketahui";
  }

  return includeAppPrefix && isDjiwaApp ? `Djiwa App - ${methodLabel}` : methodLabel;
}

export function isCustomerSelfServiceSource(source?: string | null): boolean {
  return normalize(source) === "customer_self_service";
}
