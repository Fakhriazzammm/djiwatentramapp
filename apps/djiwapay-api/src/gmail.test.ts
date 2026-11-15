import { describe, expect, test } from "bun:test";
import { gmailQuery, senderQuery } from "./gmail";
import { toRawMail } from "./mail/smtp";
import { signed } from "./mail/testing";

describe("Gmail query", () => {
  test("asks only for the listed senders, newer than the last look", () => {
    expect(senderQuery()).toContain("bca.co.id");
    expect(senderQuery()).toContain("gopay.co.id");
    expect(gmailQuery(new Date("2026-11-15T00:00:00Z"))).toMatch(/^from:\(.+\) after:1794700800$/);
  });
});

describe("authenticity of a raw Gmail message", () => {
  const ctx = (resolver: any) => ({ ip: "", helo: "", sender: "", host: "gmail", recipients: ["user@example.com"], resolver });
  test("a validly signed bank message passes and is read", async () => {
    const { raw, resolver } = await signed("gopay.co.id", "GoPay <no-reply@gopay.co.id>", "Pembayaran berhasil", "Pembayaran ke Kopi Kenangan sebesar Rp 25.000");
    const m = await toRawMail(raw, ctx(resolver));
    expect(m.auth.dkimDomains).toContain("gopay.co.id");
    expect(m.from).toBe("no-reply@gopay.co.id");
    expect(m.text).toContain("Rp 25.000");
  });
  test("a message altered after signing does not pass", async () => {
    const { raw, resolver } = await signed("gopay.co.id", "no-reply@gopay.co.id", "Pembayaran", "Pembayaran ke Toko sebesar Rp 25.000", { tamper: true });
    const m = await toRawMail(raw, ctx(resolver));
    expect(m.auth.dkimDomains).not.toContain("gopay.co.id");
    expect(m.auth.dmarcPass).toBe(false);
  });
  test("a signature that does not match the published key does not pass", async () => {
    const { raw, resolver } = await signed("gopay.co.id", "no-reply@gopay.co.id", "Pembayaran", "Rp 25.000", { wrongKey: true });
    expect((await toRawMail(raw, ctx(resolver))).auth.dkimDomains).toEqual([]);
  });
  test("a message signed by someone else's domain does not become the bank's", async () => {
    const { raw, resolver } = await signed("evil.example", "no-reply@gopay.co.id", "Pembayaran", "Rp 25.000");
    const m = await toRawMail(raw, ctx(resolver));
    expect(m.auth.dkimDomains).toEqual(["evil.example"]);
    expect(m.auth.dmarcPass).toBe(false);   // not aligned with the From domain
  });
});
