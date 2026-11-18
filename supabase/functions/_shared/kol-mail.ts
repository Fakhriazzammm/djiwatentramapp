// Template email transaksional KOL (konfirmasi visit, pembatalan, pengingat H-1, SOW diperbarui) dan pemformat SOW.
// MURNI: tanpa impor dan tanpa API Deno/DOM, supaya Edge Function, admin, dan manager memakai kode yang sama
// (admin/manager memakai ini untuk pratinjau, server memakainya untuk mengirim).

export type SowSection = { title: string; items: string[] };
export type SowSnapshot = { title: string; sections: SowSection[]; closing?: string; days?: number } | null;
export type KolMailKind = "visit_confirmed" | "visit_cancelled" | "visit_reminder" | "sow_updated";
export type KolMailPayload = {
  bookingId?: number; name: string; date: string; time: string; note?: string | null; sow: SowSnapshot; sowVersion?: number | null;
  postDeadline?: string | null; cafeName: string; address: string; mapsUrl: string; waAdmin: string; waManager: string; portalUrl: string;
};
export type BuiltEmail = { subject: string; html: string; text: string };

const BLUE = "#1a5dc6";
const LOGO_URL = "https://djiwatentram.web.id/logo-djiwa.png";

export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* ---------- Pemformat tanggal dan teks ---------- */
const parts = (day: string): [number, number, number] => { const [y = 1970, m = 1, d = 1] = String(day).slice(0, 10).split("-").map(Number); return [y, m, d]; };
export function longDate(day: string) {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
export function shortDate(day: string) {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export const dotTime = (time: string) => String(time ?? "").slice(0, 5).replace(":", ".");
export function firstName(name: string) {
  const word = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "";
}
/** Mengganti penanda {{hari_tayang}} pada teks SOW dengan jumlah hari dari pengaturan. */
export const sowText = (value: string, days = 7) => String(value ?? "").replace(/\{\{\s*hari_tayang\s*\}\}/g, String(days));

export function waDigits(phone?: string | null) {
  const digits = String(phone ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits.startsWith("62") ? digits : `62${digits}`;
}
export const waLink = (phone?: string | null, text?: string) => {
  const digits = waDigits(phone);
  return digits ? `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}` : "";
};
const prettyPhone = (phone?: string | null) => { const d = waDigits(phone); return d ? `+${d}` : ""; };

/** Teks SOW untuk dibagikan lewat WhatsApp, dengan susunan pesan yang biasa dikirim admin. */
export function sowToWhatsApp(sow: SowSnapshot, name?: string) {
  if (!sow) return "";
  const days = sow.days ?? 7;
  const lines: string[] = [`Aku izin share SOW-nya ya, Kak${name ? ` ${firstName(name)}` : ""}.`, "", sow.title];
  for (const section of sow.sections) {
    if (section.title !== sow.title) lines.push(section.title);
    for (const item of section.items) lines.push(sowText(item, days));
    lines.push("");
  }
  if (sow.closing) lines.push(sowText(sow.closing, days));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Tautan Google Calendar untuk visit (durasi 2 jam, zona Asia/Jakarta). */
export function googleCalendarUrl(p: Pick<KolMailPayload, "date" | "time" | "cafeName" | "address">) {
  const [y, m, d] = parts(p.date);
  const [hh = 0, mm = 0] = String(p.time).slice(0, 5).split(":").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
  const end = `${y}${pad(m)}${pad(d)}T${pad(Math.min(hh + 2, 23))}${pad(mm)}00`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: "Visit ke Djiwa Tentram", dates: `${start}/${end}`, ctz: "Asia/Jakarta", location: `${p.cafeName}, ${p.address}`, details: "Visit review menu dan pembuatan konten di Djiwa Tentram." });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/* ---------- Blok HTML / teks ---------- */
const p = (html: string) => `<p style="margin:0 0 14px;">${html}</p>`;
const h1 = (text: string) => `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;letter-spacing:-0.01em;">${escapeHtml(text)}</h1>`;
const button = (label: string, href: string, solid = true) => href
  ? `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 22px;border-radius:10px;font-weight:600;text-decoration:none;${solid ? `background:${BLUE};color:#ffffff;` : `border:1px solid ${BLUE};color:${BLUE};`}">${escapeHtml(label)}</a>` : "";

/** Baris detail jadwal: [label, teks biasa, HTML]. Teks biasa dan HTML dipisah agar versi teks email tidak memuat entitas HTML. */
function detailRows(payload: KolMailPayload): Array<[string, string, string]> {
  const where = [payload.cafeName, payload.address].filter(Boolean).join(", ");
  const maps = payload.mapsUrl ? ` <a href="${escapeHtml(payload.mapsUrl)}" style="color:${BLUE};">Buka di Google Maps</a>` : "";
  const date = longDate(payload.date);
  const time = `${dotTime(payload.time)} WIB`;
  return [["Tanggal", date, escapeHtml(date)], ["Jam datang", time, escapeHtml(time)], ["Lokasi", where, `${escapeHtml(where)}${maps}`]];
}
function detailHtml(payload: KolMailPayload) {
  const rows = detailRows(payload).map(([k, , html], i) => `<tr><td style="padding:9px 0;width:104px;color:#6a6a76;font-size:13px;vertical-align:top;${i ? "border-top:1px solid #e6e6ea;" : ""}">${escapeHtml(k)}</td><td style="padding:9px 0;font-weight:600;${i ? "border-top:1px solid #e6e6ea;" : ""}">${html}</td></tr>`);
  if (payload.note?.trim()) rows.push(`<tr><td style="padding:9px 0;width:104px;color:#6a6a76;font-size:13px;vertical-align:top;border-top:1px solid #e6e6ea;">Catatan tim</td><td style="padding:9px 0;border-top:1px solid #e6e6ea;">${escapeHtml(payload.note)}</td></tr>`);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;padding:6px 16px;background:#f4f7fc;border-left:3px solid ${BLUE};display:block;">${rows.join("")}</table>`;
}
function sowHtml(sow: SowSnapshot) {
  if (!sow) return "";
  const days = sow.days ?? 7;
  const sections = sow.sections.map((s) => `<p style="margin:16px 0 6px;font-weight:700;">${escapeHtml(s.title)}</p><ul style="margin:0;padding-left:20px;">${s.items.map((i) => `<li style="margin:0 0 6px;">${escapeHtml(sowText(i, days))}</li>`).join("")}</ul>`).join("");
  const closing = sow.closing ? p(`<span style="color:#444450;">${escapeHtml(sowText(sow.closing, days))}</span>`).replace("margin:0 0 14px", "margin:16px 0 0") : "";
  return `<div style="margin:22px 0 6px;padding-top:6px;border-top:1px solid #e6e6ea;"><p style="margin:14px 0 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6a6a76;">${escapeHtml(sow.title)}</p>${sections}${closing}</div>`;
}
function sowPlain(sow: SowSnapshot) {
  if (!sow) return "";
  const days = sow.days ?? 7;
  const out = [sow.title.toUpperCase()];
  for (const s of sow.sections) { out.push("", s.title, ...s.items.map((i) => `- ${sowText(i, days)}`)); }
  if (sow.closing) out.push("", sowText(sow.closing, days));
  return out.join("\n");
}
function contactHtml(payload: KolMailPayload, intro: string) {
  const items = [payload.waAdmin ? `Admin: <a href="${escapeHtml(waLink(payload.waAdmin))}" style="color:${BLUE};">${escapeHtml(prettyPhone(payload.waAdmin))}</a>` : "", payload.waManager ? `Manager: <a href="${escapeHtml(waLink(payload.waManager))}" style="color:${BLUE};">${escapeHtml(prettyPhone(payload.waManager))}</a>` : ""].filter(Boolean);
  return items.length ? p(`${escapeHtml(intro)}<br>${items.join(" &nbsp;·&nbsp; ")}`) : "";
}
function contactPlain(payload: KolMailPayload, intro: string) {
  const items = [payload.waAdmin ? `Admin: ${prettyPhone(payload.waAdmin)}` : "", payload.waManager ? `Manager: ${prettyPhone(payload.waManager)}` : ""].filter(Boolean);
  return items.length ? `${intro}\n${items.join(" · ")}` : "";
}
const PENALTY = "Sesuai persetujuan yang kamu setujui saat booking, ketidakhadiran tanpa kabar dapat dikenai konsekuensi dan denda.";

function wrap(inner: string, preheader: string, payload: KolMailPayload) {
  const footerLine = [payload.cafeName, payload.address].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Djiwa Tentram</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111114;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6ea;">
<tr><td style="padding:18px 28px;border-bottom:1px solid #e6e6ea;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="40" style="padding:0 10px 0 0;"><img src="${LOGO_URL}" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:50%;"></td><td style="font-weight:700;font-size:15px;">Djiwa Tentram<br><span style="font-weight:400;font-size:12px;color:#6a6a76;">Creator Partnership</span></td></tr></table></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6;">${inner}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e6e6ea;background:#fafafb;font-size:12px;line-height:1.6;color:#6a6a76;">Email ini dikirim otomatis dan tidak dapat dibalas. Untuk bertanya, hubungi kami lewat WhatsApp di atas.<br>${escapeHtml(footerLine)}</td></tr>
</table></td></tr></table></body></html>`;
}

/* ---------- Pembuat email ---------- */
export function buildKolEmail(kind: KolMailKind, payload: KolMailPayload): BuiltEmail {
  const greet = `Halo Kak ${firstName(payload.name) || "Creator"},`;
  const when = `${shortDate(payload.date)} · ${dotTime(payload.time)} WIB`;
  const detailText = detailRows(payload).map(([k, plain]) => `${k}: ${plain}`).join("\n") + (payload.mapsUrl ? `\nPeta: ${payload.mapsUrl}` : "") + (payload.note?.trim() ? `\nCatatan tim: ${payload.note.trim()}` : "");
  const calendar = googleCalendarUrl(payload);

  if (kind === "visit_cancelled") {
    const html = wrap(h1("Jadwal visit dibatalkan") + p(escapeHtml(greet)) +
      p(`Jadwal visit kamu pada <strong>${escapeHtml(longDate(payload.date))}</strong> pukul <strong>${escapeHtml(dotTime(payload.time))} WIB</strong> dibatalkan oleh tim Djiwa Tentram.`) +
      (payload.note?.trim() ? p(`Catatan tim: ${escapeHtml(payload.note)}`) : "") +
      p("Kamu bisa memilih jadwal baru kapan saja di portal creator.") + `<p style="margin:20px 0 8px;">${button("Pilih jadwal baru", payload.portalUrl)}</p>` +
      contactHtml(payload, "Ada pertanyaan? Hubungi kami lewat WhatsApp:"), `Jadwal visit ${when} dibatalkan`, payload);
    const text = [greet, "", `Jadwal visit kamu pada ${longDate(payload.date)} pukul ${dotTime(payload.time)} WIB dibatalkan oleh tim Djiwa Tentram.`, payload.note?.trim() ? `Catatan tim: ${payload.note.trim()}` : "", "", `Pilih jadwal baru: ${payload.portalUrl}`, "", contactPlain(payload, "Ada pertanyaan? Hubungi kami lewat WhatsApp:")].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
    return { subject: `Jadwal visit dibatalkan: ${shortDate(payload.date)}`, html, text };
  }

  const headline = kind === "visit_confirmed" ? "Visit kamu sudah terkonfirmasi" : kind === "visit_reminder" ? "Besok visit kamu ke Djiwa Tentram" : "Scope of Work visit kamu diperbarui";
  const intro = kind === "visit_confirmed"
    ? `Terima kasih sudah booking. Jadwal visit kamu ke <strong>${escapeHtml(payload.cafeName)}</strong> sudah <strong>dikonfirmasi</strong> oleh tim kami.`
    : kind === "visit_reminder"
      ? "Ini pengingat bahwa kamu dijadwalkan datang <strong>besok</strong>. Sampai jumpa!"
      : "Tim Djiwa Tentram memperbarui Scope of Work untuk visit kamu. Mohon baca versi terbaru di bawah ini.";
  const introText = kind === "visit_confirmed" ? `Terima kasih sudah booking. Jadwal visit kamu ke ${payload.cafeName} sudah dikonfirmasi oleh tim kami.`
    : kind === "visit_reminder" ? "Ini pengingat bahwa kamu dijadwalkan datang besok. Sampai jumpa!" : "Tim Djiwa Tentram memperbarui Scope of Work untuk visit kamu. Mohon baca versi terbaru di bawah ini.";
  const deadlineHtml = payload.postDeadline ? `<div style="margin:18px 0;padding:12px 16px;background:#fdf6e7;border-left:3px solid #b7791f;">Batas tayang konten: <strong>${escapeHtml(longDate(payload.postDeadline))}</strong></div>` : "";
  const html = wrap(
    h1(headline) + p(escapeHtml(greet)) + p(intro) + detailHtml(payload) + sowHtml(payload.sow) + deadlineHtml +
    `<p style="margin:22px 0 8px;">${button("Lihat jadwal & SOW", payload.portalUrl)}${button("Tambah ke Google Calendar", calendar, false)}</p>` +
    contactHtml(payload, "Perlu mengubah jadwal atau berhalangan hadir? Kabari tim lewat WhatsApp sebelum hari H:") + p(`<span style="font-size:13px;color:#6a6a76;">${escapeHtml(PENALTY)}</span>`),
    `${when} · ${payload.cafeName}`, payload);
  const text = [greet, "", introText, "", detailText, "", sowPlain(payload.sow),
    payload.postDeadline ? `\nBatas tayang konten: ${longDate(payload.postDeadline)}` : "", "",
    `Lihat jadwal & SOW: ${payload.portalUrl}`, `Tambah ke Google Calendar: ${calendar}`, "",
    contactPlain(payload, "Perlu mengubah jadwal atau berhalangan hadir? Kabari tim lewat WhatsApp sebelum hari H:"), "", PENALTY].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
  const subject = kind === "visit_confirmed" ? `Visit terkonfirmasi: ${when}` : kind === "visit_reminder" ? `Besok visit kamu · ${dotTime(payload.time)} WIB` : "SOW visit kamu diperbarui";
  return { subject, html, text };
}

/** Contoh data untuk pratinjau dan email uji. */
export function sampleKolPayload(partial: Partial<KolMailPayload> = {}): KolMailPayload {
  const base: KolMailPayload = {
    name: "Erva Oktaviani", date: "2026-11-25", time: "14:00", note: "", postDeadline: "2026-12-02", cafeName: "Djiwa Tentram Cafe & Resto - Tasikmalaya",
    address: "Jalan Bojong Tengah No. 34, Tasikmalaya", mapsUrl: "https://maps.app.goo.gl/UhvbAfqZ7fcTUgfD6", waAdmin: "085156399831", waManager: "", portalUrl: "https://kol.djiwatentram.web.id/visit",
    sow: { title: "Scope of Work", days: 7, sections: [{ title: "Scope of Work", items: ["1x visit ke Djiwa Tentram", "1x video TikTok, lalu video yang sama di-mirror ke Instagram Reels"] }, { title: "Complimentary untuk Kakak", items: ["2 makanan", "2 minuman"] }, { title: "Catatan", items: ["Konten diharapkan tayang maksimal {{hari_tayang}} hari setelah visit."] }], closing: "Kalau ada bagian SOW yang ingin didiskusikan, boleh banget disampaikan ya, Kak." },
  };
  return { ...base, ...partial };
}
