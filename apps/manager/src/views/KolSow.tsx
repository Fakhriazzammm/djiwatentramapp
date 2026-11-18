// SOW (Scope of Work) berversi, kontak kunjungan, pratinjau email, dan riwayat email per booking untuk Manager.
// Aturan dan template sama dengan server dan halaman admin (supabase/functions/_shared/kol-mail.ts).
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { buildKolEmail, sampleKolPayload, sowToWhatsApp, type KolMailKind, type SowSection, type SowSnapshot } from "../../../../supabase/functions/_shared/kol-mail";
import { Empty, Panel } from "../ui";

export type SowVersion = { id: number; version: number; title: string; sections: SowSection[]; closing: string; note?: string | null; is_active: boolean; created_by: string; created_at: string };
export type VisitSettings = { cafe_name: string; address: string; maps_url: string; wa_admin: string; wa_manager: string; post_deadline_days: number };
export type EmailRow = { id: number; kind: KolMailKind; booking_id: number | null; kol_id: string; to_email: string | null; status: string; attempts: number; last_error?: string | null; scheduled_at: string; sent_at?: string | null; created_at: string };
type SendFn = (body: Record<string, unknown>, message?: string) => Promise<{ ok: boolean; data: unknown }>;
type VisitLike = { id: number; status: string; booking_date: string; sow_version?: number | null; sow_snapshot?: SowSnapshot; sow_customized?: boolean; post_deadline?: string | null; kol_creators?: { name: string } | null };

export const EMAIL_KIND: Record<KolMailKind, string> = { visit_confirmed: "Konfirmasi visit", visit_cancelled: "Pembatalan visit", visit_reminder: "Pengingat H-1", sow_updated: "SOW diperbarui" };
const EMAIL_STATUS: Record<string, [string, string]> = { pending: ["Dalam antrean", "md"], sending: ["Mengirim", "ai"], sent: ["Terkirim", "ok"], failed: ["Gagal", "hi"], skipped: ["Tidak dikirim", ""] };
const EMAIL_NOTE: Record<string, string> = { EMAIL_TIDAK_ADA: "Creator belum punya email", EMAIL_TIDAK_VALID: "Alamat email tidak valid", BOOKING_DIBATALKAN: "Booking dibatalkan", DIBATALKAN_ADMIN: "Dibatalkan" };
const MAIL_KINDS: KolMailKind[] = ["visit_confirmed", "visit_reminder", "sow_updated", "visit_cancelled"];

type Draft = { title: string; sections: SowSection[]; closing: string };
const cleanSections = (sections: SowSection[]): SowSection[] => sections.map((s) => ({ title: s.title.trim(), items: s.items.map((i) => i.trim()).filter(Boolean) })).filter((s) => s.title && s.items.length);
const draftOf = (sow: { title: string; sections: SowSection[]; closing?: string } | null | undefined): Draft =>
  ({ title: sow?.title ?? "Scope of Work", sections: (sow?.sections ?? [{ title: "Scope of Work", items: [""] }]).map((s) => ({ title: s.title, items: [...s.items] })), closing: sow?.closing ?? "" });
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—");
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const copyText = async (text: string, label: string) => { try { await navigator.clipboard.writeText(text); toast.success(`${label} disalin`); } catch { toast.error("Gagal menyalin. Salin manual."); } };

/* ---------- Editor ---------- */
function SowEditor({ value, onChange }: { value: Draft; onChange: (next: Draft) => void }) {
  const setSection = (index: number, patch: Partial<SowSection>) => onChange({ ...value, sections: value.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= value.sections.length) return;
    const next = [...value.sections];
    [next[index], next[to]] = [next[to]!, next[index]!];
    onChange({ ...value, sections: next });
  };
  return (
    <div>
      <label>Judul SOW</label>
      <input className="f" value={value.title} maxLength={160} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      {value.sections.map((section, si) => (
        <div key={si} style={{ border: "1px solid var(--line, #e4e4e8)", padding: 10, marginTop: 10 }}>
          <div className="crow" style={{ marginTop: 0 }}>
            <input className="f" style={{ flex: 1, fontWeight: 600 }} aria-label={`Judul bagian ${si + 1}`} placeholder="Judul bagian, mis. Complimentary" value={section.title} maxLength={120} onChange={(e) => setSection(si, { title: e.target.value })} />
            <button className="btn s" aria-label="Naikkan bagian" disabled={si === 0} onClick={() => move(si, -1)}>↑</button>
            <button className="btn s" aria-label="Turunkan bagian" disabled={si === value.sections.length - 1} onClick={() => move(si, 1)}>↓</button>
            <button className="btn s r" aria-label="Hapus bagian" disabled={value.sections.length <= 1} onClick={() => onChange({ ...value, sections: value.sections.filter((_, i) => i !== si) })}>Hapus</button>
          </div>
          {section.items.map((item, ii) => (
            <div key={ii} className="crow" style={{ marginTop: 6, alignItems: "flex-start" }}>
              <textarea className="f" style={{ flex: 1, minHeight: 38 }} rows={item.length > 70 ? 3 : 1} aria-label={`Poin ${ii + 1} bagian ${si + 1}`} value={item} maxLength={500} onChange={(e) => setSection(si, { items: section.items.map((x, i) => (i === ii ? e.target.value : x)) })} />
              <button className="btn s r" aria-label="Hapus poin" onClick={() => setSection(si, { items: section.items.filter((_, i) => i !== ii) })}>✕</button>
            </div>
          ))}
          <button className="btn s" style={{ marginTop: 6 }} onClick={() => setSection(si, { items: [...section.items, ""] })}>+ Poin</button>
        </div>
      ))}
      <button className="btn s" style={{ marginTop: 10 }} disabled={value.sections.length >= 12} onClick={() => onChange({ ...value, sections: [...value.sections, { title: "", items: [""] }] })}>+ Bagian</button>
      <label style={{ marginTop: 12 }}>Kalimat penutup</label>
      <textarea className="f" rows={2} maxLength={1000} value={value.closing} onChange={(e) => onChange({ ...value, closing: e.target.value })} />
      <div className="meta">Gunakan {"{{hari_tayang}}"} untuk batas tayang otomatis dari pengaturan.</div>
    </div>
  );
}

/* ---------- Panel SOW & Email (sub-tab Visit) ---------- */
export function SowPanel({ versions, settings, visits, send }: { versions: SowVersion[]; settings: VisitSettings | null; visits: VisitLike[]; send: SendFn }) {
  const active = versions.find((v) => v.is_active) ?? null;
  const [sub, setSub] = useState<"sow" | "history" | "contact" | "email">("sow");
  const [draft, setDraft] = useState<Draft>(() => draftOf(active));
  const [note, setNote] = useState("");
  const [apply, setApply] = useState(true);
  const [busy, setBusy] = useState("");
  const [mailKind, setMailKind] = useState<KolMailKind>("visit_confirmed");
  const [form, setForm] = useState({ cafeName: settings?.cafe_name ?? "", address: settings?.address ?? "", mapsUrl: settings?.maps_url ?? "", waAdmin: settings?.wa_admin ?? "", waManager: settings?.wa_manager ?? "", days: String(settings?.post_deadline_days ?? 7) });

  const upcoming = useMemo(() => visits.filter((v) => v.status === "confirmed" && String(v.booking_date).slice(0, 10) >= todayKey() && !v.sow_customized).length, [visits]);
  const clean = cleanSections(draft.sections);
  const valid = draft.title.trim().length >= 2 && clean.length > 0;
  const days = Number(form.days) || 7;
  const payload = useMemo(() => sampleKolPayload({ cafeName: settings?.cafe_name, address: settings?.address ?? "", mapsUrl: settings?.maps_url ?? "", waAdmin: settings?.wa_admin ?? "", waManager: settings?.wa_manager ?? "", sow: { title: draft.title, sections: clean, closing: draft.closing, days } }), [settings, draft, clean, days]);
  const mail = useMemo(() => buildKolEmail(mailKind, payload), [mailKind, payload]);

  const publish = async () => {
    setBusy("publish");
    const res = await send({ action: "sow_publish", title: draft.title, sections: clean, closing: draft.closing, note, apply }, "SOW baru terbit");
    if (res.ok) setNote("");
    setBusy("");
  };
  const saveSettings = async () => { setBusy("settings"); await send({ action: "settings_save", cafeName: form.cafeName, address: form.address, mapsUrl: form.mapsUrl, waAdmin: form.waAdmin, waManager: form.waManager, postDeadlineDays: Number(form.days) }, "Pengaturan kunjungan tersimpan"); setBusy(""); };

  return (
    <>
      <div className="pad" style={{ paddingBottom: 6 }}>
        <div className="crow" style={{ marginTop: 0 }}>
          <button className={`btn s${sub === "sow" ? " p" : ""}`} onClick={() => setSub("sow")}>SOW</button>
          <button className={`btn s${sub === "history" ? " p" : ""}`} onClick={() => setSub("history")}>Riwayat ({versions.length})</button>
          <button className={`btn s${sub === "contact" ? " p" : ""}`} onClick={() => setSub("contact")}>Kontak &amp; lokasi</button>
          <button className={`btn s${sub === "email" ? " p" : ""}`} onClick={() => setSub("email")}>Pratinjau email</button>
        </div>
      </div>
      <div className="pad">
        {sub === "sow" && (
          <>
            <div className="meta" style={{ marginBottom: 8 }}>Versi aktif: <b>{active ? `v${active.version}` : "belum ada"}</b>. Tiap perubahan menjadi versi baru; versi lama ada di Riwayat.</div>
            <SowEditor value={draft} onChange={setDraft} />
            <label style={{ marginTop: 12 }}>Catatan perubahan (opsional)</label>
            <input className="f" value={note} maxLength={500} placeholder="mis. Menambah complimentary" onChange={(e) => setNote(e.target.value)} />
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
              <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Terapkan ke <b>{upcoming}</b> booking terkonfirmasi yang belum berlangsung dan kabari creator lewat email. <span className="meta">Booking yang SOW-nya diubah manual tidak ikut berubah.</span></span>
            </label>
            <div className="crow">
              <button className="btn s p" disabled={!valid || busy === "publish"} onClick={() => void publish()}>{busy === "publish" ? "Menerbitkan…" : `Terbitkan versi ${(versions[0]?.version ?? 0) + 1}`}</button>
              <button className="btn s" disabled={!valid} onClick={() => void copyText(sowToWhatsApp({ title: draft.title, sections: clean, closing: draft.closing, days }), "Teks WhatsApp")}>Salin sebagai teks WhatsApp</button>
            </div>
          </>
        )}
        {sub === "history" && (versions.length === 0 ? <Empty>BELUM ADA RIWAYAT</Empty> : (
          <div className="sc"><table>
            <thead><tr><th>Versi</th><th>Catatan</th><th>Oleh</th><th>Waktu</th><th>Aksi</th></tr></thead>
            <tbody>{versions.map((v) => (
              <tr key={v.id}>
                <td><b>v{v.version}</b> {v.is_active && <span className="tg ok">Aktif</span>}</td>
                <td>{v.note || v.title}</td><td>{v.created_by}</td><td>{fmt(v.created_at)}</td>
                <td>{!v.is_active && <button className="btn s" onClick={() => { setDraft(draftOf(v)); setNote(`Kembali ke isi versi ${v.version}`); setSub("sow"); }}>Pakai lagi</button>}</td>
              </tr>))}
            </tbody></table></div>
        ))}
        {sub === "contact" && (
          <>
            <label>Nama tempat</label><input className="f" value={form.cafeName} onChange={(e) => setForm({ ...form, cafeName: e.target.value })} />
            <label style={{ marginTop: 10 }}>Alamat</label><input className="f" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <label style={{ marginTop: 10 }}>Link Google Maps</label><input className="f" inputMode="url" value={form.mapsUrl} placeholder="https://maps.app.goo.gl/…" onChange={(e) => setForm({ ...form, mapsUrl: e.target.value })} />
            <div className="crow" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 160 }}><label>WhatsApp admin</label><input className="f" inputMode="tel" value={form.waAdmin} onChange={(e) => setForm({ ...form, waAdmin: e.target.value })} /></div>
              <div style={{ flex: 1, minWidth: 160 }}><label>WhatsApp manager</label><input className="f" inputMode="tel" value={form.waManager} onChange={(e) => setForm({ ...form, waManager: e.target.value })} />{!form.waManager && <div className="meta">Belum diisi: baris Manager tidak tampil di email.</div>}</div>
            </div>
            <label style={{ marginTop: 10 }}>Batas tayang (hari setelah visit)</label>
            <input className="f" style={{ maxWidth: 120 }} type="number" min={1} max={60} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            <div className="crow"><button className="btn s p" disabled={busy === "settings"} onClick={() => void saveSettings()}>{busy === "settings" ? "Menyimpan…" : "Simpan pengaturan"}</button></div>
          </>
        )}
        {sub === "email" && (
          <>
            <div className="crow" style={{ marginTop: 0 }}>
              {MAIL_KINDS.map((k) => <button key={k} className={`btn s${mailKind === k ? " p" : ""}`} onClick={() => setMailKind(k)}>{EMAIL_KIND[k]}</button>)}
            </div>
            <div className="meta" style={{ margin: "8px 0" }}>Subjek: <b>{mail.subject}</b> · Dari: Djiwa Tentram &lt;hello@mail.djiwatentram.web.id&gt;</div>
            <iframe title="Pratinjau email" sandbox="" srcDoc={mail.html} style={{ width: "100%", height: 520, border: "1px solid #e4e4e8", background: "#fff" }} />
            <div className="meta" style={{ marginTop: 6 }}>Pratinjau memakai data contoh dan SOW pada editor. Email nyata memakai data booking dan SOW yang tersimpan. Kirim email uji tersedia di halaman admin.</div>
          </>
        )}
      </div>
    </>
  );
}

/* ---------- SOW + email pada satu booking ---------- */
export function BookingExtras({ visit, emails, send }: { visit: VisitLike; emails: EmailRow[]; send: SendFn }) {
  const sow = visit.sow_snapshot ?? null;
  const rows = emails.filter((e) => e.booking_id === visit.id).sort((a, b) => b.id - a.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(sow));
  const [notify, setNotify] = useState(true);
  const valid = draft.title.trim().length >= 2 && cleanSections(draft.sections).length > 0;
  const defaultKind: KolMailKind = visit.status === "cancelled" ? "visit_cancelled" : "visit_confirmed";

  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: "pointer", fontSize: 12 }}>SOW &amp; email{rows[0] ? ` · ${EMAIL_STATUS[rows[0].status]?.[0] ?? rows[0].status}` : ""}</summary>
      <div style={{ marginTop: 6 }}>
        {visit.status === "requested" ? <div className="meta">SOW aktif disalin saat visit dikonfirmasi, lalu dikirim lewat email.</div> : sow ? (
          <div>
            <div className="meta">Versi {visit.sow_version ?? "?"}{visit.sow_customized ? " · diubah manual" : ""}{visit.post_deadline ? ` · batas tayang ${visit.post_deadline}` : ""}</div>
            {sow.sections.map((s) => (<div key={s.title} style={{ marginTop: 4 }}><b style={{ fontSize: 12 }}>{s.title}</b><ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 12 }}>{s.items.map((i, n) => <li key={n}>{i.replace(/\{\{\s*hari_tayang\s*\}\}/g, String(sow.days ?? 7))}</li>)}</ul></div>))}
          </div>
        ) : <div className="meta">Booking ini belum punya SOW. Pakai SOW terbaru.</div>}

        {visit.status !== "requested" && !editing && (
          <div className="crow">
            <button className="btn s" onClick={() => { setDraft(draftOf(sow)); setEditing(true); }}>Ubah SOW booking</button>
            <button className="btn s" onClick={() => { if (window.confirm("Ganti SOW booking ini dengan SOW aktif terbaru dan kabari creator lewat email?")) void send({ action: "booking_sow_sync", id: visit.id, notify: true }, "SOW booking mengikuti versi terbaru"); }}>Pakai SOW terbaru</button>
            {sow && <button className="btn s" onClick={() => void copyText(sowToWhatsApp(sow, visit.kol_creators?.name), "Teks WhatsApp")}>Salin teks WA</button>}
          </div>
        )}
        {editing && (
          <div style={{ marginTop: 6 }}>
            <SowEditor value={draft} onChange={setDraft} />
            <label style={{ display: "flex", gap: 8, marginTop: 8 }}><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Kabari creator lewat email</label>
            <div className="crow">
              <button className="btn s p" disabled={!valid} onClick={async () => { const r = await send({ action: "booking_sow_set", id: visit.id, title: draft.title, sections: cleanSections(draft.sections), closing: draft.closing, notify }, "SOW booking diperbarui"); if (r.ok) setEditing(false); }}>Simpan SOW booking</button>
              <button className="btn s" onClick={() => setEditing(false)}>Batal</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <b style={{ fontSize: 12 }}>Email ke creator</b>
          {rows.length === 0 ? <div className="meta">Belum ada email untuk booking ini.</div> : rows.map((r) => (
            <div key={r.id} className="crow" style={{ marginTop: 4, justifyContent: "space-between" }}>
              <span style={{ fontSize: 12 }}>{EMAIL_KIND[r.kind] ?? r.kind} · {r.to_email ?? "—"}<span className="meta"> · {r.sent_at ? `terkirim ${fmt(r.sent_at)}` : `dijadwalkan ${fmt(r.scheduled_at)}`}{r.last_error ? ` · ${EMAIL_NOTE[r.last_error] ?? r.last_error}` : ""}</span></span>
              <span><span className={`tg ${EMAIL_STATUS[r.status]?.[1] ?? ""}`}>{EMAIL_STATUS[r.status]?.[0] ?? r.status}</span>{r.status === "pending" && <button className="btn s r" style={{ marginLeft: 6 }} onClick={() => void send({ action: "email_skip", id: r.id }, "Email dibatalkan")}>Batalkan</button>}</span>
            </div>
          ))}
          {visit.status !== "requested" && <div className="crow"><button className="btn s" onClick={() => void send({ action: "email_resend", bookingId: visit.id, kind: defaultKind }, "Email masuk antrean dan segera dikirim")}>Kirim ulang {EMAIL_KIND[defaultKind].toLowerCase()}</button></div>}
        </div>
      </div>
    </details>
  );
}

export { Panel };
