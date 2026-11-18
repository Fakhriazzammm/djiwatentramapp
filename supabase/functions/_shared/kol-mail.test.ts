import { describe, expect, it } from "bun:test";
import { buildKolEmail, dotTime, firstName, googleCalendarUrl, longDate, sampleKolPayload, sowText, sowToWhatsApp, waLink } from "./kol-mail";

describe("kol-mail helpers", () => {
  it("formats dates, times and names", () => {
    expect(longDate("2026-11-25")).toContain("25 November 2026");
    expect(longDate("2026-11-25").toLowerCase()).toContain("rabu");
    expect(dotTime("14:00:00")).toBe("14.00");
    expect(firstName("tasyqi m aulia")).toBe("Tasyqi");
    expect(firstName("")).toBe("");
  });
  it("normalizes WhatsApp numbers", () => {
    expect(waLink("0851-5639-9831")).toBe("https://wa.me/6285156399831");
    expect(waLink("+62 851 5639 9831")).toBe("https://wa.me/6285156399831");
    expect(waLink("")).toBe("");
  });
  it("replaces the post-deadline token in SOW text", () => {
    expect(sowText("tayang maksimal {{hari_tayang}} hari", 10)).toBe("tayang maksimal 10 hari");
    expect(sowText("tayang maksimal {{ hari_tayang }} hari")).toBe("tayang maksimal 7 hari");
  });
  it("builds a Google Calendar link in Jakarta time", () => {
    const url = googleCalendarUrl(sampleKolPayload());
    expect(url).toContain("ctz=Asia%2FJakarta");
    expect(url).toContain("20261125T140000%2F20261125T160000");
  });
  it("exports the SOW as the WhatsApp message admins send", () => {
    const text = sowToWhatsApp(sampleKolPayload().sow, "Erva Oktaviani");
    expect(text.startsWith("Aku izin share SOW-nya ya, Kak Erva.")).toBe(true);
    expect(text).toContain("1x visit ke Djiwa Tentram");
    expect(text).toContain("Complimentary untuk Kakak\n2 makanan\n2 minuman");
    expect(text).toContain("tayang maksimal 7 hari");
    expect(text).not.toContain("{{");
    expect(text.endsWith("boleh banget disampaikan ya, Kak.")).toBe(true);
  });
});

describe("buildKolEmail", () => {
  it("builds the confirmation email with schedule, SOW, deadline and contacts", () => {
    const mail = buildKolEmail("visit_confirmed", sampleKolPayload({ waManager: "081200000000", note: "Datang lewat pintu depan" }));
    expect(mail.subject).toBe("Visit terkonfirmasi: Rab, 25 Nov 2026 · 14.00 WIB");
    expect(mail.html).toContain("Halo Kak Erva,");
    expect(mail.html).toContain("1x visit ke Djiwa Tentram");
    expect(mail.html).toContain("tayang maksimal 7 hari");
    expect(mail.html).toContain("Batas tayang konten");
    expect(mail.html).toContain("https://wa.me/6285156399831");
    expect(mail.html).toContain("https://wa.me/6281200000000");
    expect(mail.html).toContain("Datang lewat pintu depan");
    expect(mail.html).toContain("denda");
    expect(mail.html).not.toContain("{{");
    expect(mail.text).toContain("Tanggal: ");
    expect(mail.text).toContain("Peta: https://maps.app.goo.gl/");
    expect(mail.text).not.toMatch(/<[a-z]/i);
  });
  it("omits the manager line when no manager number is set", () => {
    const mail = buildKolEmail("visit_confirmed", sampleKolPayload({ waManager: "" }));
    expect(mail.html).not.toContain("Manager:");
    expect(mail.html).toContain("Admin:");
  });
  it("escapes creator-controlled text", () => {
    const mail = buildKolEmail("visit_confirmed", sampleKolPayload({ name: "<script>alert(1)</script>", note: "<b>x</b>" }));
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<b>x</b>");
    expect(mail.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
  it("builds cancellation, reminder and SOW-update emails", () => {
    const cancelled = buildKolEmail("visit_cancelled", sampleKolPayload({ note: "Kafe tutup renovasi" }));
    expect(cancelled.subject).toContain("dibatalkan");
    expect(cancelled.html).toContain("Pilih jadwal baru");
    expect(cancelled.html).toContain("Kafe tutup renovasi");
    const reminder = buildKolEmail("visit_reminder", sampleKolPayload());
    expect(reminder.subject).toBe("Besok visit kamu · 14.00 WIB");
    expect(reminder.html).toContain("Sampai jumpa");
    const updated = buildKolEmail("sow_updated", sampleKolPayload());
    expect(updated.subject).toBe("SOW visit kamu diperbarui");
    expect(updated.html).toContain("Scope of Work");
  });
  it("still renders when no SOW snapshot exists", () => {
    const mail = buildKolEmail("visit_confirmed", sampleKolPayload({ sow: null, postDeadline: null }));
    expect(mail.html).not.toContain("Batas tayang konten");
    expect(mail.subject).toContain("terkonfirmasi");
  });
});
