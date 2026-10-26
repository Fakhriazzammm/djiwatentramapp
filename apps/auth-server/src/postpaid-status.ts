export function postpaidPaymentStatus(row: { payment_status?: unknown; provider_status?: unknown; status?: unknown }): "success" | "failed" | "pending" {
  if (row.payment_status === "paid") return "success";
  if (row.payment_status === "failed") return "failed";
  return "pending";
}
