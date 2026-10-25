import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const checkoutSource = readFileSync(resolve(import.meta.dir, "../src/components/checkout-section.tsx"), "utf8");
const bookingStyles = readFileSync(resolve(import.meta.dir, "../src/index.css"), "utf8");

describe("booking checkout layout", () => {
  test("renders booking context as separated, readable metadata", () => {
    expect(checkoutSource).toContain('aria-label="Ringkasan booking"');
    expect(checkoutSource).toContain("djiwa-checkout-booking-context__primary");
    expect(checkoutSource).toContain("djiwa-checkout-booking-context__meta");
  });

  test("restores visible form controls inside the shared checkout surface", () => {
    expect(bookingStyles).toContain(".djiwa-checkout-page .djiwa-checkout-input");
    expect(bookingStyles).toContain(".djiwa-checkout-page .djiwa-checkout-textarea");
    expect(bookingStyles).toContain(".djiwa-checkout-fields");
  });

  test("keeps checkout sections and actions visually aligned", () => {
    expect(bookingStyles).toContain(".djiwa-checkout-page .djiwa-checkout-section");
    expect(bookingStyles).toContain(".djiwa-checkout-page .djiwa-checkout-actions");
    expect(bookingStyles).toContain(".djiwa-checkout-page .djiwa-order-summary");
  });
});
