import type { PayCheckoutKind, PayPaymentMethod } from "./djiwa-pay-checkout";

export type CheckoutDraft = {
  kind: PayCheckoutKind;
  productCode: string;
  category: string;
  customerNumber: string;
  amount: number;
  topupAmount?: number;
  pending?: boolean;
  paymentMethod: PayPaymentMethod;
  returnTo: string;
};

export function serializeCheckoutDraft(draft: CheckoutDraft) {
  return JSON.stringify(draft);
}

export function parseCheckoutDraft(value: string | null): CheckoutDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CheckoutDraft>;
    if (
      (parsed.kind !== "topup" && parsed.kind !== "ppob") ||
      typeof parsed.productCode !== "string" ||
      typeof parsed.category !== "string" ||
      typeof parsed.customerNumber !== "string" ||
      typeof parsed.amount !== "number" ||
      (parsed.topupAmount !== undefined && typeof parsed.topupAmount !== "number") ||
      (parsed.pending !== undefined && typeof parsed.pending !== "boolean") ||
      (parsed.paymentMethod !== "wallet" && parsed.paymentMethod !== "mayar") ||
      typeof parsed.returnTo !== "string"
    ) return null;
    return parsed as CheckoutDraft;
  } catch {
    return null;
  }
}
