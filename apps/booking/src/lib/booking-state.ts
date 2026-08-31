import type { BookingStep } from "./booking-constants";
import type { CustomerForm } from "./booking-validation";

export type BookingScreen = "landing" | BookingStep | "success" | "status";
export type BookingCart = Record<string, number>;

export type BookingDraftState = {
  bookingType: string;
  eventType: string;
  eventTypeOther: string;
  selectedDate: string;
  arrivalTime: string;
  guests: number;
  cart: BookingCart;
  customer: CustomerForm;
  customAnswers: Record<string, unknown>;
};

export const EMPTY_CUSTOMER: CustomerForm = { name: "", phone: "", email: "", notes: "" };

export function emptyBookingDraft(): BookingDraftState {
  return {
    bookingType: "",
    eventType: "",
    eventTypeOther: "",
    selectedDate: "",
    arrivalTime: "",
    guests: 2,
    cart: {},
    customer: { ...EMPTY_CUSTOMER },
    customAnswers: {},
  };
}

export function normalizeBookingDraft(value: unknown): BookingDraftState {
  if (!value || typeof value !== "object") return emptyBookingDraft();
  const parsed = value as Record<string, unknown>;
  const customer = parsed.customer && typeof parsed.customer === "object" ? parsed.customer as Partial<CustomerForm> : {};
  return {
    bookingType: String(parsed.bookingType || ""),
    eventType: String(parsed.eventType || ""),
    eventTypeOther: String(parsed.eventTypeOther || ""),
    selectedDate: String(parsed.selectedDate || ""),
    arrivalTime: String(parsed.arrivalTime || ""),
    guests: Math.max(1, Number(parsed.guests || 2)),
    cart: parsed.cart && typeof parsed.cart === "object" ? parsed.cart as BookingCart : {},
    customer: { ...EMPTY_CUSTOMER, ...customer },
    customAnswers: parsed.customAnswers && typeof parsed.customAnswers === "object" ? parsed.customAnswers as Record<string, unknown> : {},
  };
}
