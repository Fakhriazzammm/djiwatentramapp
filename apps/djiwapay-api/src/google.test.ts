import { describe, expect, test } from "bun:test";
import { billEvent, decrypt, encrypt, featuresFromScopes, googleConfig, nextDate, scopesFor, sheetRows, SCOPES } from "./google";

describe("token encryption", () => {
  const key = Buffer.alloc(32, 7);
  test("round-trips and is different every time", () => {
    const a = encrypt(key, "refresh-token-123"), b = encrypt(key, "refresh-token-123");
    expect(a).not.toBe(b);
    expect(decrypt(key, a)).toBe("refresh-token-123");
    expect(a).not.toContain("refresh-token");
  });
  test("a wrong key or tampered value fails closed", () => {
    const a = encrypt(key, "x");
    expect(() => decrypt(Buffer.alloc(32, 8), a)).toThrow();
    const [iv, tag, enc] = a.split(".");
    expect(() => decrypt(key, [iv, tag, Buffer.from("zzzz").toString("base64url")].join("."))).toThrow();
    expect(enc.length).toBeGreaterThan(0);
  });
});

describe("configuration and scopes", () => {
  test("is off without credentials or with a short key", () => {
    expect(googleConfig({})).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", GOOGLE_TOKEN_KEY: "short" })).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", GOOGLE_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64") })?.redirectUri).toBe("https://djiwapay.web.id/api/finance/google/callback");
  });
  test("asks only for the scopes the chosen features need", () => {
    expect(scopesFor(["drive"])).toEqual([SCOPES.email, SCOPES.drive]);
    expect(scopesFor(["calendar", "drive"])).toEqual([SCOPES.email, SCOPES.calendar, SCOPES.drive]);
    expect(featuresFromScopes([SCOPES.email, SCOPES.drive])).toEqual({ calendar: false, drive: true, gmail: false });
  });
});

describe("calendar events for recurring bills", () => {
  const now = new Date("2026-11-15T03:00:00Z");   // 10:00 WIB on 15 Nov
  test("picks the next occurrence of the day", () => {
    expect(nextDate(20, now)).toBe("2026-11-20");
    expect(nextDate(10, now)).toBe("2026-12-10");
    expect(nextDate(15, now)).toBe("2026-11-15");
    expect(nextDate(31, new Date("2026-11-15T03:00:00Z"))).toBe("2026-11-30");
  });
  test("builds an all-day monthly event with a reminder the day before", () => {
    const e = billEvent({ id: "b1", name: "Listrik PLN", amount: 350000, day: 20 }, now);
    expect(e).toMatchObject({ summary: "Tagihan Listrik PLN", start: { date: "2026-11-20" }, end: { date: "2026-11-21" }, recurrence: ["RRULE:FREQ=MONTHLY;BYMONTHDAY=20"] });
    expect(e.reminders.overrides[0].minutes).toBe(900);
    expect(e.extendedProperties.private.billId).toBe("b1");
  });
  test("a day past the 28th falls on the last day of shorter months", () => {
    expect(billEvent({ id: "b", name: "x", amount: 1, day: 31 }, now).recurrence[0]).toContain("BYSETPOS=-1");
  });
});

describe("sheet export", () => {
  test("lays out entries in WIB with readable names and a monthly summary", () => {
    const r = sheetRows([
      { at: "2026-11-15T06:45:00Z", kind: "out", amount: "25000.00", category_id: "makan", account_id: "email-gopay", note: "Kopi Kenangan", source: "email" },
      { at: "2026-11-01T00:30:00Z", kind: "in", amount: 5000000, category_id: "gaji", account_id: "tunai", note: "Gaji", source: "manual" },
    ], { cat: { makan: "Makan & minum", gaji: "Gaji" }, acc: { "email-gopay": "GoPay", tunai: "Tunai" } });
    expect(r.catatan[0]).toEqual(["Tanggal", "Jam", "Jenis", "Kategori", "Dompet", "Jumlah", "Catatan", "Sumber"]);
    expect(r.catatan[1]).toEqual(["2026-11-15", "13:45", "Pengeluaran", "Makan & minum", "GoPay", 25000, "Kopi Kenangan", "Email"]);
    expect(r.ringkasan[1]).toEqual(["2026-11", 5000000, 25000, 4975000]);
  });
});
