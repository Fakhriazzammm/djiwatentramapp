export function brandMayarConfig(environment: string | undefined, key: string | undefined) {
  if (!key || (environment !== "sandbox" && environment !== "production")) return null;
  return {
    key,
    base: environment === "production" ? "https://api.mayar.id/hl/v2" : "https://api.mayar.io/hl/v2",
  };
}

type ProviderInvoice = { id?: unknown; status?: unknown; amount?: unknown; transactionId?: unknown };
type ProviderTransaction = {
  id?: unknown;
  status?: unknown;
  amount?: unknown;
  paymentLink?: { id?: unknown };
  extraData?: unknown;
};
export type BrandPaymentResult =
  | { status: "pending" | "expired" }
  | { status: "review"; reason: string }
  | { status: "paid"; transactionId: string };

export function verifyBrandTopup(
  expected: { invoiceId: string; total: number },
  invoice: ProviderInvoice,
  transaction?: ProviderTransaction | null,
): BrandPaymentResult {
  if (invoice.id !== expected.invoiceId || invoice.amount !== expected.total) {
    return { status: "review", reason: "INVOICE_MISMATCH" };
  }
  if (["expired", "cancelled", "canceled", "closed"].includes(String(invoice.status))) {
    return { status: "expired" };
  }
  if (invoice.status !== "paid") return { status: "pending" };
  if (typeof invoice.transactionId !== "string" || !invoice.transactionId) {
    return { status: "review", reason: "TRANSACTION_ID_MISSING" };
  }
  if (!transaction) return { status: "pending" };
  if (
    transaction.id !== invoice.transactionId ||
    transaction.amount !== expected.total ||
    transaction.paymentLink?.id !== expected.invoiceId
  )
    return { status: "review", reason: "TRANSACTION_MISMATCH" };
  if (transaction.status !== "paid") return { status: "pending" };
  return { status: "paid", transactionId: invoice.transactionId };
}

export async function mayarBrandRequest<T>(
  config: { base: string; key: string },
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${config.base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  const result = (await response.json()) as { statusCode?: number; data?: T };
  if (!response.ok || ![200, 201].includes(result.statusCode ?? 0) || result.data == null)
    throw new Error(`MAYAR_PROVIDER_${response.status}`);
  return result.data;
}

export async function checkBrandTopup(
  config: { base: string; key: string },
  invoiceId: string,
  total: number,
) {
  const invoice = await mayarBrandRequest<ProviderInvoice>(
    config,
    `/invoices/${encodeURIComponent(invoiceId)}`,
  );
  const expected = { invoiceId, total };
  const preliminary = verifyBrandTopup(expected, invoice);
  if (
    preliminary.status !== "pending" ||
    invoice.status !== "paid" ||
    typeof invoice.transactionId !== "string"
  )
    return preliminary;
  const transaction = await mayarBrandRequest<ProviderTransaction>(
    config,
    `/transactions/${encodeURIComponent(invoice.transactionId)}`,
  );
  return verifyBrandTopup(expected, invoice, transaction);
}
