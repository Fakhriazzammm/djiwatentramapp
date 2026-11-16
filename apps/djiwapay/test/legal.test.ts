import { describe, expect, test } from "bun:test";
import { LIMITED_USE, PRIVACY, TERMS } from "../src/lib/legal-content";

const text = (s: typeof PRIVACY) => s.flatMap((x) => [x.title, ...x.body]).join("\n");
describe("legal pages", () => {
  test("the privacy policy carries Google's Limited Use statement and names every scope the app requests", () => {
    const t = text(PRIVACY);
    expect(t).toContain(LIMITED_USE);
    expect(LIMITED_USE).toContain("Google API Services User Data Policy");
    for (const scope of ["calendar.events", "drive.file", "gmail.readonly"]) expect(t).toContain(scope);
  });
  test("it says what is stored from mail, what is not, and how to disconnect and delete", () => {
    const t = text(PRIVACY);
    expect(t).toContain("Isi email tidak disimpan");
    expect(t).toContain("Putuskan Google");
    expect(t).toContain("myaccount.google.com/permissions");
    expect(t).toContain("Hapus semua data keuangan");
    expect(t).toContain("tidak kami pakai untuk melatih model");
  });
  test("the terms say automatic reading can be wrong and that this is not financial advice", () => {
    const t = text(TERMS);
    expect(t).toContain("Bukan nasihat keuangan");
    expect(t).toContain("bisa keliru");
  });
});
