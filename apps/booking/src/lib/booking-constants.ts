export const BOOKING_SLUG = import.meta.env.VITE_BOOKING_SLUG?.trim() || "booking";
export const BOOKING_API_URL = import.meta.env.VITE_BOOKING_API_URL?.trim() || `${import.meta.env.VITE_SUPABASE_URL?.trim() || ""}/functions/v1/public-booking`;
export const DEV_FALLBACK = import.meta.env.VITE_BOOKING_DEV_FALLBACK === "true";

export const BOOKING_STEPS = ["date", "menu", "customer", "review"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];
