import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bookingRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(bookingRoot, "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("booking shared checkout contract", () => {
  test("registers booking on the shared checkout standard", () => {
    const registry = JSON.parse(read("config/djiwa-checkout-apps.json")) as { customerCheckoutApps?: string[] };
    const manifest = JSON.parse(read("apps/booking/package.json")) as { dependencies?: Record<string, string> };

    expect(registry.customerCheckoutApps).toContain("booking");
    expect(manifest.dependencies?.["@yumipos/djiwa-checkout-ui"]).toBe("workspace:*");
    expect(read("apps/booking/src/main.tsx")).toContain("@yumipos/djiwa-checkout-ui/styles.css");
  });

  test("uses the shared checkout surface and canonical QRIS payment method", () => {
    expect(read("apps/booking/src/components/checkout-section.tsx")).toContain("CustomerCheckout");
    expect(read("apps/booking/src/lib/client.ts")).toContain('paymentMethod: "qris"');
  });
});
