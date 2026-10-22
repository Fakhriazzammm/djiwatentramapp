import type { PayCheckoutKind, PayPaymentMethod } from "./djiwa-pay-checkout";

export type CheckoutDraft = {
  kind: PayCheckoutKind;
  productCode: string;
  category: string;
  customerNumber: string;
  amount: number;
  topupAmount?: number;
  invoiceId?: string;
  pending?: boolean;
  receipt?: { serialNumber?: string; reference?: string };
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
      (parsed.invoiceId !== undefined && typeof parsed.invoiceId !== "string") ||
      (parsed.pending !== undefined && typeof parsed.pending !== "boolean") ||
      (parsed.receipt !== undefined && (!parsed.receipt || typeof parsed.receipt !== "object" || (parsed.receipt.serialNumber !== undefined && typeof parsed.receipt.serialNumber !== "string") || (parsed.receipt.reference !== undefined && typeof parsed.receipt.reference !== "string"))) ||
      (parsed.paymentMethod !== "wallet" && parsed.paymentMethod !== "mayar") ||
      typeof parsed.returnTo !== "string"
    ) return null;
    return parsed as CheckoutDraft;
  } catch {
    return null;
  }
}
