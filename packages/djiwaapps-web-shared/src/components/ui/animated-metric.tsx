import { Numbers } from "@sfinterface/numbers";
import { useSyncExternalStore } from "react";
import "@sfinterface/numbers/styles.css";

const LOCALE = "id-ID";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const IDR: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
};
const PLAIN_COUNT: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION).matches
  );
}

/**
 * Shared engine for the rolling number components.
 *
 * Only the digits that actually move turn, the direction follows the value, and
 * the formatted text comes from Intl so the readout matches the app's own
 * formatting exactly.
 *
 * Accessibility: the animated strip is aria-hidden and the package ships a
 * visually hidden copy of the formatted text, so screen readers read the value
 * once, never the intermediate digits. `prefers-reduced-motion` is handled here
 * rather than by the library — the package only drops its blur under that query
 * and still rolls the digits — so a reduced-motion user gets the plain value with
 * no digit DOM. The server snapshot keeps hydration identical when the
 * preference differs between server and client.
 *
 * Budget: a drawn number costs roughly 40 DOM nodes per digit (a 30-cell strip
 * each way), so use it for a handful of KPI figures per screen. Keep dense
 * tables, long lists, cashier keypads and printed receipts on plain text —
 * receipts must always show the exact stored amount.
 *
 * Typography and layout stay with the caller: the components only inherit font,
 * size, weight and colour, so keep them inside the element that carries those
 * classes instead of passing layout classes into them.
 */
function RollingNumber({
  value,
  format,
}: {
  value: number | null | undefined;
  format: Intl.NumberFormatOptions;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );

  if (value == null || !Number.isFinite(value)) return <>Belum tersedia</>;

  if (reducedMotion) {
    return <>{new Intl.NumberFormat(LOCALE, format).format(value)}</>;
  }
  return <Numbers value={value} locale={LOCALE} format={format} />;
}

/** Rupiah KPI figure, formatted exactly like the app's `formatRupiah`. */
export function AnimatedMetric({ value }: { value: number | null | undefined }) {
  return <RollingNumber value={value} format={IDR} />;
}

/** Plain integer KPI figure (counts, not money). */
export function AnimatedCount({ value }: { value: number | null | undefined }) {
  return <RollingNumber value={value} format={PLAIN_COUNT} />;
}
