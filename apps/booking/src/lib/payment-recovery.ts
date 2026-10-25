export type StoredInvoice = { invoiceId: string; invoiceUrl: string };

export function parseStoredInvoice(raw: string | null): StoredInvoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { invoiceId?: unknown; invoiceUrl?: unknown };
    if (typeof value.invoiceId !== "string" || !value.invoiceId || typeof value.invoiceUrl !== "string" || !value.invoiceUrl) return null;
    return { invoiceId: value.invoiceId, invoiceUrl: value.invoiceUrl };
  } catch {
    return null;
  }
}

export function reuseInvoiceForAttach(invoice: StoredInvoice | null) {
  return invoice;
}
