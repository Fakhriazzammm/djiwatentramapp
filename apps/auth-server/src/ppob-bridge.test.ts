import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("postpaid pay bridge contract", () => {
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
