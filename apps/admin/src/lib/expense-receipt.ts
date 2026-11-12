/** Receipt sources used by manual finance entries and receipt ingestion. */
export function expenseReceiptUrl(
  transaction: { attachmentUrl?: unknown; metadata?: unknown },
  documentUrl?: unknown,
): string | null {
  const metadata =
    transaction.metadata && typeof transaction.metadata === "object"
      ? (transaction.metadata as Record<string, unknown>)
      : {};
  for (const value of [
    metadata.receipt_image_url,
    metadata.receiptImageUrl,
    transaction.attachmentUrl,
    documentUrl,
  ]) {
    if (typeof value !== "string" || !value.trim()) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:")
        return url.href;
    } catch {
      /* Invalid references are not usable images. */
    }
  }
  return null;
}
