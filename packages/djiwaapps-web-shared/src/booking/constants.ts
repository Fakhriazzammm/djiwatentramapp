export const BOOKING_STATUSES = ["pending", "confirmed", "arrived", "seated", "completed", "cancelled", "no_show", "expired"] as const;
export const PAYMENT_STATUSES = ["pending", "paid", "verified", "refunded", "failed"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
