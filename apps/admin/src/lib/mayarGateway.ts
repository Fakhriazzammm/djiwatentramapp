type MayarResult = {
  success?: boolean;
  message?: string;
  statusCode?: number;
  messages?: string;
  id?: string;
  transactionId?: string;
  link?: string;
  data?: { id?: string; transactionId?: string; link?: string; status?: string; amount?: number };
};

async function callProxy(body: Record<string, unknown>): Promise<MayarResult> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mayar-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error?.message || result?.messages || "Gagal memproses pembayaran");
  }
  return result;
}

/** @deprecated Use the orderId-based server contract instead. */
export async function mayarCreateInvoiceViaItems(payload: Record<string, unknown>): Promise<MayarResult> {
  if (!payload.orderId) {
    return { success: false, message: "Gunakan create invoice berbasis orderId melalui server." };
  }
  return callProxy({
    action: "create-invoice-from-order",
    orderId: payload.orderId,
    idempotencyKey: payload.idempotencyKey,
    paymentMethod: payload.paymentMethod,
    redirectUrl: payload.redirectUrl,
  });
}

export async function mayarGetTransaction(id: string): Promise<MayarResult> {
  return callProxy({ action: "get-invoice-detail", invoiceId: id });
}

export function isMayarConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL);
}
