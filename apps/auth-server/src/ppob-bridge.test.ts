import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("postpaid pay bridge contract", () => {
  test("uses the custom Djiwa Pay origin and keeps the legacy origin allowed", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain('const PAY_BRIDGE_ORIGIN = "https://djiwapay.web.id"');
    expect(source).toContain('https://pay.djiwatentram.web.id');
    expect(source).toContain("PAY_BRIDGE_ORIGINS");
  });

  test("sets the Pay bridge session cookie for cross-site iframe requests", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("SameSite=None");
    expect(source).toContain("Partitioned");
  });

  test("registers inquiry, payment, and status routes", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("/api/pay-bridge/ppob/postpaid/inquiry");
    expect(source).toContain("/api/pay-bridge/ppob/postpaid/payment");
    expect(source).toContain("/api/pay-bridge/ppob/postpaid/status");
  });

  test("payment route reloads stored total and uses wallet hold RPC", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("SELECT * FROM pos.ppob_transactions WHERE ref_id=$1 AND customer_source_id=$2");
    expect(source).toContain("pos.wallet_create_hold");
    expect(source).toContain("body.paymentMethod !== \"wallet\"");
  });
});
