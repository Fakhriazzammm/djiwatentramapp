import { describe, expect, test } from "bun:test";
import { googleVerdict } from "./mail/smtp";
import { redactForShare } from "./mail/extract";

describe("Google's own verdict on old mail", () => {
  const good = "Authentication-Results: mx.google.com;\r\n       dkim=pass header.i=@gopay.co.id header.s=sel header.b=abc123;\r\n       spf=pass (google.com: domain of no-reply@gopay.co.id designates 1.2.3.4 as permitted sender) smtp.mailfrom=no-reply@gopay.co.id;\r\n       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=gopay.co.id";
  test("is read from the topmost header, with the DKIM domain and DMARC result", () => {
    expect(googleVerdict([good])).toEqual({ dmarcPass: true, dmarcFrom: "gopay.co.id", dkimDomains: ["gopay.co.id"] });
  });
  test("a header from anyone but Google is not believed", () => {
    expect(googleVerdict([good.replace("mx.google.com", "mx.evil.example")])).toEqual({ dmarcPass: false, dmarcFrom: null, dkimDomains: [] });
    expect(googleVerdict([good.replace("mx.google.com", "mx.google.com.evil.example")])).toEqual({ dmarcPass: false, dmarcFrom: null, dkimDomains: [] });
  });
  test("failing results stay failing, and a sender-written header below Google's is ignored", () => {
    const bad = "Authentication-Results: mx.google.com; dkim=fail header.i=@gopay.co.id; dmarc=fail header.from=gopay.co.id";
    expect(googleVerdict([bad, good])).toEqual({ dmarcPass: false, dmarcFrom: null, dkimDomains: [] });
    expect(googleVerdict([])).toEqual({ dmarcPass: false, dmarcFrom: null, dkimDomains: [] });
  });
});

describe("sharing a sample", () => {
  test("masks numbers, e-mail addresses, phone numbers and greeted names", () => {
    const out = redactForShare("Halo Budi Santoso, rekening 1234567890123 menerima Rp 25.000. Hubungi budi@mail.com atau 081234567890. Yth. Siti Aminah");
    expect(out).not.toContain("1234567890123"); expect(out).not.toContain("budi@mail.com"); expect(out).not.toContain("081234567890");
    expect(out).not.toContain("Budi Santoso"); expect(out).not.toContain("Siti Aminah");
    expect(out).toContain("Rp 25.000");          // the amount stays: that is what a parser needs
  });
});
