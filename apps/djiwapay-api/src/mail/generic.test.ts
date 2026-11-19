import { describe, expect, test } from "bun:test";
import { GENERIC_DAILY_LIMIT, broadQuery, genericIssuer, senderAuthentic, senderName } from "./generic";
import { hookScript } from "../hook";
import { gmailQuery } from "../gmail";

describe("unknown senders", () => {
  test("a readable name from the sending domain", () => {
    expect(senderName("notif.tokopedia.com")).toBe("Tokopedia"); expect(senderName("mail.shopee.co.id")).toBe("Shopee"); expect(senderName("invoice.acme-studio.id")).toBe("Acme-studio");
    expect(genericIssuer("pay.warung.id")).toMatchObject({ id: "other", name: "Warung", domains: ["pay.warung.id"] });
  });
  test("authentic only when the mail proves it came from the domain it claims", () => {
    expect(senderAuthentic("shopee.co.id", { dmarcPass: true, dkimDomains: [] })).toBe(true);
    expect(senderAuthentic("mail.shopee.co.id", { dmarcPass: false, dkimDomains: ["shopee.co.id"] })).toBe(true);     // parent signs for a subdomain
    expect(senderAuthentic("shopee.co.id", { dmarcPass: false, dkimDomains: ["mail.shopee.co.id"] })).toBe(true);
    expect(senderAuthentic("shopee.co.id", { dmarcPass: false, dkimDomains: ["evil.com"] })).toBe(false);
    expect(senderAuthentic("shopee.co.id", { dmarcPass: false, dkimDomains: [] })).toBe(false);
    expect(senderAuthentic("shopee.co.id", { dmarcPass: false, dkimDomains: ["notshopee.co.id"] })).toBe(false);      // a look-alike is not a parent
  });
  test("the search looks at subjects, skips promotions and spam, and is bounded", () => {
    const q = broadQuery();
    expect(q).toContain("subject:("); expect(q).toContain("pembayaran"); expect(q).toContain("invoice"); expect(q).toContain("-category:promotions"); expect(q).toContain("-in:spam");
    expect(q.length).toBeLessThan(1200); expect(GENERIC_DAILY_LIMIT).toBeGreaterThan(0);
  });
  test("Gmail polling adds the broad search only when opted in", () => {
    const since = new Date("2026-11-15T00:00:00Z");
    expect(gmailQuery(since)).not.toContain("subject:(");
    expect(gmailQuery(since, true)).toContain("subject:(");
  });
  test("the script asks for the new field, never reads email on its own, and skips the person's own mail", () => {
    const s = hookScript("https://example.test/api/finance/hook/TOKEN");
    expect(s).toContain("cfg.broadQuery"); expect(s).toContain("?v=2"); expect(s).toContain("tidak pernah dikirim"); expect(s).not.toContain("deleteMessage");
  });
});
