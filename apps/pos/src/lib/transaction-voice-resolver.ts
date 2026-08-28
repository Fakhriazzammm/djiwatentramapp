type VoiceInput = {
  eventKey: string;
  source: string;
  eventType: "pos_created" | "order_cashier_pending" | "order_paid";
  paymentMethod?: string | null;
  orderId?: string | null;
  customerName?: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function customerSuffix(customerName?: string | null) {
  const name = String(customerName ?? "").trim();
  return name ? ` atas nama ${name}` : "";
}

function paymentLabel(paymentMethod?: string | null) {
  const method = normalize(paymentMethod);
  if (method === "wallet" || method === "djiwa_pay" || method === "djiwaapp") return "Djiwa Pay";
  if (method === "qris" || method === "qris_mayar" || method === "mayar") return "QRIS";
  return "kasir";
}

export function resolveTransactionVoice(input: VoiceInput) {
  const source = normalize(input.source);
  const orderId = String(input.orderId ?? input.eventKey).trim();
  const name = customerSuffix(input.customerName);

  if (input.eventType === "pos_created" || source === "pos") {
    return {
      eventKey: input.eventKey || `pos-order:${orderId}:created`,
      text: "Pesanan baru diterima.",
    };
  }

  if (input.eventType === "order_cashier_pending") {
    return {
      eventKey: input.eventKey || `order:${orderId}:order_cashier_pending`,
      text: `Pesanan baru DjiwaApp${name}, menunggu pembayaran di kasir.`,
    };
  }

  return {
    eventKey: input.eventKey || `order:${orderId}:order_paid:${paymentLabel(input.paymentMethod)}`,
    text: `Pesanan DjiwaApp${name} sudah dibayar melalui ${paymentLabel(input.paymentMethod)}.`,
  };
}
