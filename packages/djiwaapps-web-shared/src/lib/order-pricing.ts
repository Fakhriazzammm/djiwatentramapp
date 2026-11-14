/**
 * Returns discounts that may be applied after item prices are finalized.
 *
 * Happy Hour and other item promotions are already reflected in item.price.
 * Only an additional order-level voucher may be passed to the tax/order
 * authority, otherwise the item promotion is deducted a second time.
 */
export function getAdditionalOrderDiscount(
  _promoDiscountAmount: number | null | undefined,
  voucherDiscountAmount: number | null | undefined,
): number {
  const voucher = Number(voucherDiscountAmount ?? 0);
  return Number.isFinite(voucher) ? Math.max(0, voucher) : 0;
}
