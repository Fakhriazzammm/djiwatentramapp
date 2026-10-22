export type PayTransactionStatus = "idle" | "pending" | "success" | "failed" | "expired";

export function normalizePayTransactionStatus(status: unknown): PayTransactionStatus {
  const value = String(status ?? "").toLowerCase();
  if (["success", "paid", "completed", "settled"].includes(value)) return "success";
  if (["failed", "failure", "rejected", "cancelled", "canceled"].includes(value)) return "failed";
  if (["expired", "closed", "void"].includes(value)) return "expired";
  if (["pending", "processing", "created", "waiting"].includes(value)) return "pending";
  return "idle";
}

export function transactionStatusLabel(status: PayTransactionStatus) {
  return {
    idle: "Siap diproses",
    pending: "Sedang diproses",
    success: "Berhasil",
    failed: "Gagal",
    expired: "Kedaluwarsa",
  }[status];
}

export function canPollTransaction(status: PayTransactionStatus, invoiceId?: string | null) {
  return status === "pending" && Boolean(invoiceId);
}

export function shouldClearTransactionDraft(status: PayTransactionStatus) {
  return status === "success" || status === "failed" || status === "expired";
}
