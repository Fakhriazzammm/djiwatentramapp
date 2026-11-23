import { describe, expect, test } from "bun:test";
import { appsConfig, cleanItems, issuerForPackage, toMail } from "./notif.js";
import { ISSUERS } from "./mail/issuers.js";
import { extractPayment, isSecretMail } from "./mail/extract.js";

describe("android notification capture", () => {
  test("apps map to their bank, and unknown apps map to nothing", () => {
    expect(issuerForPackage("id.bmri.livin")?.id).toBe("mandiri");
    expect(issuerForPackage("com.jago.digitalBanking")?.id).toBe("jago");
    expect(issuerForPackage("com.whatsapp")).toBeNull();
  });
  test("no package belongs to two issuers, and no issuer id repeats", () => {
    const pk = ISSUERS.flatMap((i) => i.packages), ids = ISSUERS.map((i) => i.id);
    expect(new Set(pk).size).toBe(pk.length); expect(new Set(ids).size).toBe(ids.length);
  });
  test("the phone is told exactly which apps to listen to", () => { expect(appsConfig().every((a) => a.packages.length > 0)).toBe(true); expect(appsConfig().length).toBeGreaterThan(50); });
  test("input is cleaned: no package or no text is dropped, long text cut, a wrong clock replaced", () => {
    const now = Date.now(), r = cleanItems([{ pkg: "id.dana", title: "t", text: "x".repeat(5000), at: now - 1000 }, { pkg: "", title: "a", text: "b" }, { pkg: "id.dana", title: "", text: "" }, { pkg: "id.dana", title: "a", text: "b", at: 5 }]);
    expect(r).toHaveLength(2); expect(r[0].text).toHaveLength(1200); expect(r[1].at).toBeGreaterThan(now - 5000);
    expect(cleanItems("nope")).toEqual([]);
  });
  test("the same notification within a minute has one id, a minute later another", () => {
    const i = issuerForPackage("id.dana")!, t = Date.now(), a = toMail({ pkg: "id.dana", title: "Pembayaran", text: "Rp10.000", at: t }, i), b = toMail({ pkg: "id.dana", title: "Pembayaran", text: "Rp10.000", at: t + 1000 }, i);
    expect(a.messageId).toBe(b.messageId);
    expect(toMail({ pkg: "id.dana", title: "Pembayaran", text: "Rp10.000", at: t + 120_000 }, i).messageId).not.toBe(a.messageId);
    expect(a.auth.dkimDomains).toEqual(["dana.id"]);
  });
  test("an OTP notification is refused by the same secret gate as e-mail", () => { expect(isSecretMail("Kode OTP", "Kode OTP kamu 482913. Jangan berikan ke siapa pun.")).toBe(true); });
  test("a typical payment notification reads as money out", () => {
    const x = extractPayment("Pembayaran berhasil", "Pembayaran berhasil Rp 25.000 ke KOPI ARA");
    expect(x.amount).toBe(25000);
  });
});
