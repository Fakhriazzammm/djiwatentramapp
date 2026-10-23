import { invokeEdgeFunction } from "@/lib/api-helper";

export type CustomerWalletTransaction = {
  id: number;
  transfer_id: string | null;
  direction: "credit" | "debit";
  category: string;
  type: string;
  amount: number;
  balance_after: number;
  status: string;
  counterparty_name: string | null;
  counterparty_phone: string | null;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_at: string;
};

export type CustomerWalletNotification = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  action_payload?: { transferId?: string };
  created_at: string;
  unread: boolean;
};

type WalletRequest = { sourceId: string; email: string; action: string; notificationId?: string };

export async function readCustomerWalletTransactions(sourceId: string, email: string) {
  return invokeEdgeFunction<{ transactions?: CustomerWalletTransaction[] }>("customer-wallet", { action: "get", sourceId, email });
}

export async function readCustomerWalletNotifications(sourceId: string, email: string) {
  const result = await invokeEdgeFunction<{ notifications?: CustomerWalletNotification[] }>("customer-wallet", { action: "notifications", sourceId, email } as WalletRequest);
  return result.notifications ?? [];
}

export async function markCustomerWalletNotificationRead(sourceId: string, email: string, notificationId: string) {
  await invokeEdgeFunction("customer-wallet", { action: "mark-notification-read", sourceId, email, notificationId } as WalletRequest);
}

export async function markAllCustomerWalletNotificationsRead(sourceId: string, email: string) {
  await invokeEdgeFunction("customer-wallet", { action: "mark-all-notifications-read", sourceId, email } as WalletRequest);
}

export function walletTransactionLabel(transaction: Pick<CustomerWalletTransaction, "type" | "direction" | "counterparty_name">) {
  if (transaction.type === "wallet_transfer_sent") return `Saldo dikirim ke ${transaction.counterparty_name || "Customer Djiwa"}`;
  if (transaction.type === "wallet_transfer_received") return `Saldo diterima dari ${transaction.counterparty_name || "Customer Djiwa"}`;
  if (transaction.type === "topup_completed") return "Top up saldo";
  if (transaction.type === "order_debit") return "Pembayaran dengan Djiwa Pay";
  if (transaction.type === "refund" || transaction.type === "wallet_release") return "Saldo dikembalikan";
  return transaction.direction === "credit" ? "Saldo masuk" : "Saldo keluar";
}
