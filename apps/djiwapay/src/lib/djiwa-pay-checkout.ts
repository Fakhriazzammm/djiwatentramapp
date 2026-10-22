export type PayCheckoutKind = "topup" | "ppob";
export type PayCheckoutStage = "detail" | "payment" | "status";
export type PayPaymentMethod = "wallet" | "mayar";

export function checkoutStep(kind: PayCheckoutKind, stage: PayCheckoutStage) {
  void kind;
  return {
    step: stage === "detail" ? 1 : stage === "payment" ? 2 : 3,
    totalSteps: 3,
  } as const;
}

export function paymentLabel(kind: PayCheckoutKind, method: PayPaymentMethod, amount: number) {
  const formattedAmount = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount).replace(/\u00a0/g, " ");

  if (kind === "topup" || method === "mayar") return `Lanjutkan ke QRIS${kind === "ppob" ? ` · ${formattedAmount}` : ""}`;
  return `Bayar dengan Djiwa Pay · ${formattedAmount}`;
}

export function walletPaymentState(balance: number, total: number) {
  const shortage = Math.max(0, total - balance);
  return { disabled: shortage > 0, shortage } as const;
}
