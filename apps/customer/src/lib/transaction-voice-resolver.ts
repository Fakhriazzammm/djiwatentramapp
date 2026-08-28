function customerSuffix(customerName?: string | null) {
  const name = String(customerName ?? "").trim();
  return name ? ` atas nama ${name}` : "";
}

function paymentLabel(paymentMethod?: string | null) {
  const method = String(paymentMethod ?? "").trim().toLowerCase();
  if (method === "wallet" || method === "djiwa_pay" || method === "djiwaapp") return "Djiwa Pay";
  if (method === "qris" || method === "qris_mayar" || method === "mayar") return "QRIS";
  return "kasir";
}

export type CustomerVoiceInput = {
  eventType: "order_created" | "order_cashier_pending" | "order_paid";
  paymentMethod?: string | null;
  customerName?: string | null;
};

export type CustomerVoiceOutput = {
  text: string;
};

/** DjiwaApp (customer) announcement texts. Voice 1 ("Pesanan baru diterima.") is POS-only. */
export function resolveCustomerTransactionVoice(input: CustomerVoiceInput): CustomerVoiceOutput {
  const name = customerSuffix(input.customerName);

  if (input.eventType === "order_cashier_pending") {
    return {
      text: `Pesanan baru DjiwaApp${name}, menunggu pembayaran di kasir.`,
    };
  }

  if (input.eventType === "order_paid") {
    return {
      text: `Pesanan DjiwaApp${name} sudah dibayar melalui ${paymentLabel(input.paymentMethod)}.`,
    };
  }

  return { text: "Pesanan baru diterima." };
}
