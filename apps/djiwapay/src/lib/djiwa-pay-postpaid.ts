export type PostpaidStage = "detail" | "inquiry" | "confirmation" | "pending" | "success" | "failed";
export function validatePostpaidCustomerNumber(serviceType: "pln" | "pdam", value: string) {
  const digits = value.replace(/\D/g, "");
  const validLength = serviceType === "pln" ? digits.length >= 11 && digits.length <= 13 : digits.length >= 8 && digits.length <= 20;
  return validLength ? { valid: true, message: null } as const : { valid: false, message: serviceType === "pln" ? "ID pelanggan PLN harus 11–13 digit." : "Nomor pelanggan PDAM harus 8–20 digit." } as const;
}
export function postpaidTotal(billAmount: number, adminFee: number) { return Math.max(0, Math.round(billAmount) + Math.round(adminFee)); }
export function postpaidReceiptVisible(stage: PostpaidStage) { return stage === "success"; }
