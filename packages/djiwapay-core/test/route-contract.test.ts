import { describe, expect, test } from "bun:test";
import { buildDjiwaPayUrl, normalizeReturnTarget } from "../src";
describe("Djiwa Pay route contract", () => {
  test("builds an allowlisted return target", () => expect(buildDjiwaPayUrl({ context: "customer", returnTo: "https://djiwatentram.yumme.id/alice/saldo?tab=history" })).toBe("https://pay.djiwatentram.web.id/customer/wallet?returnTo=https%3A%2F%2Fdjiwatentram.yumme.id%2Falice%2Fsaldo%3Ftab%3Dhistory"));
  test("rejects an external return target", () => expect(normalizeReturnTarget("https://evil.example/steal")).toBeNull());
  test("rejects non-HTTPS targets", () => expect(normalizeReturnTarget("javascript:alert(1)")).toBeNull());
  test("uses wallet as the default route", () => expect(buildDjiwaPayUrl({ context: "customer" })).toBe("https://pay.djiwatentram.web.id/customer/wallet"));
});
