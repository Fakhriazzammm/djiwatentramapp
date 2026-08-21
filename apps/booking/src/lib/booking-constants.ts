export const BOOKING_SLUG = import.meta.env.VITE_BOOKING_SLUG?.trim() || "booking";
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || "https://supabase.yumme.id";
export const BOOKING_API_URL = import.meta.env.VITE_BOOKING_API_URL?.trim() || `${SUPABASE_URL}/functions/v1/public-booking`;
export const DEV_FALLBACK = import.meta.env.VITE_BOOKING_DEV_FALLBACK === "true";

export const BOOKING_STEPS = ["type", "event-type", "date", "menu", "review", "checkout"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export type BookingOption = {
  key: string;
  label: string;
  description: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  requiresCustomText?: boolean;
};

export const BOOKING_ICON_NAMES = [
  "users",
  "calendar-heart",
  "heart-handshake",
  "users-round",
  "graduation-cap",
  "handshake",
  "sparkles",
] as const;
