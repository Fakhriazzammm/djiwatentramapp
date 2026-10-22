const MAX_TOPUP_DIGITS = 8;
export const MIN_TOPUP_AMOUNT = 1000;

export function applyTopupKey(current: string, key: string) {
  if (key === "delete") return current.length > 1 ? current.slice(0, -1) : "0";
  if (!/^\d$/.test(key)) return current;
  return (current === "0" ? key : `${current}${key}`).replace(/^0+(?=\d)/, "").slice(0, MAX_TOPUP_DIGITS);
}

export function normalizeTopupAmount(input: string) {
  const value = Number(input.replace(/\D/g, ""));
  return { value: Number.isSafeInteger(value) ? value : 0, valid: Number.isSafeInteger(value) && value >= MIN_TOPUP_AMOUNT } as const;
}
