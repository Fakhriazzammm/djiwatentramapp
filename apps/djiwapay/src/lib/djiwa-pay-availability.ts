export type WalletQuickActionKey = "topup" | "send" | "receive" | "scan" | "history" | "card" | "withdraw" | "help";

export function walletQuickActionState(key: WalletQuickActionKey) {
  return key === "scan" || key === "withdraw"
    ? { supported: false, badge: "Soon" }
    : { supported: true, badge: "" };
}
