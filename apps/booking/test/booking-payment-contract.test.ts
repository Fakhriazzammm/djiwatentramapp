import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../..", "..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("booking server payment contract", () => {
  test("creates Mayar invoices only through public-booking", () => {
    const client = read("apps/booking/src/lib/client.ts");
    expect(client).toContain('callBookingApi("create-payment"');
    expect(client).not.toContain("functions/v1/mayar-proxy");
    expect(client).not.toContain('action: "create-invoice"');
  });

  test("keeps a submit lock and waits for auth before creating a booking", () => {
    const source = read("apps/booking/src/main.tsx");
    expect(source).toContain("submitLock");
    expect(source).toContain("authLoading");
    expect(source).toContain("authError");
  });

  test("keeps payment retry metadata for an interrupted checkout", () => {
    const client = read("apps/booking/src/lib/client.ts");
    expect(client).toContain("booking-pending-payment-");
    expect(client).toContain("paymentGateway");
  });
});
