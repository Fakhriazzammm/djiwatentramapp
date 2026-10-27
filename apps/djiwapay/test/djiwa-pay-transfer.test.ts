import { describe, expect, test } from "bun:test";
import { buildWalletQrSvg } from "../src/lib/djiwa-pay-qr";
import { buildWalletReceivePayload, formatWalletPhone, normalizeWalletPhone, parseWalletRecipientPayload } from "../src/lib/djiwa-pay-transfer";

describe("Djiwa Pay receive QR", () => {
  test("normalizes Indonesian phone numbers", () => {
    expect(normalizeWalletPhone("0851-5639-9831")).toBe("6285156399831");
    expect(normalizeWalletPhone("+62 851 5639 9831")).toBe("6285156399831");
    expect(normalizeWalletPhone("12345")).toBe("");
    expect(formatWalletPhone("6285156399831")).toBe("0851-5639-9831");
  });

  test("round-trips the canonical transfer payload", () => {
    const payload = buildWalletReceivePayload("085156399831");
    expect(payload).toBe("djiwapay://transfer?phone=6285156399831");
    expect(parseWalletRecipientPayload(payload)).toBe("6285156399831");
  });

  test("accepts a transfer link from the pay domain", () => {
    expect(parseWalletRecipientPayload("https://pay.djiwatentram.web.id/wallet/transfer?phone=085156399831")).toBe("6285156399831");
    expect(parseWalletRecipientPayload("https://pay.djiwatentram.web.id/wallet/transfer/?phone=6285156399831")).toBe("6285156399831");
  });

  test("rejects QR codes that are not Djiwa Pay transfer codes", () => {
    expect(parseWalletRecipientPayload("https://example.com/wallet/transfer?phone=6285156399831")).toBeNull();
    expect(parseWalletRecipientPayload("https://pay.djiwatentram.web.id/wallet/help?phone=6285156399831")).toBeNull();
    expect(parseWalletRecipientPayload("djiwapay://receive?phone=6285156399831")).toBeNull();
    expect(parseWalletRecipientPayload("djiwapay://transfer?phone=12345")).toBeNull();
    expect(parseWalletRecipientPayload("bukan qr djiwa")).toBeNull();
  });

  test("renders a scalable SVG QR for the payload", () => {
    const svg = buildWalletQrSvg(buildWalletReceivePayload("085156399831"));
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox");
    expect(svg).toContain("<path");
    expect(svg.length).toBeGreaterThan(500);
  });
});
