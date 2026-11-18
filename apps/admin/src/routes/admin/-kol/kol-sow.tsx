// SOW (Scope of Work) berversi, pengaturan kunjungan, pratinjau email, dan riwayat email per booking.
// Aturan dan templatenya sama dengan server (supabase/functions/_shared/kol-mail.ts) dan halaman manager.
import { ArrowDown, ArrowUp, Copy, Mail, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { requestAdminConfirm } from "@/lib/admin-dialogs";
import { buildKolEmail, sampleKolPayload, sowToWhatsApp, type KolMailKind, type SowSection, type SowSnapshot } from "../../../../../../supabase/functions/_shared/kol-mail";
import { Btn, Chips, ErrorBox, Field, KV, Label, Panel, SectionLabel, StatusTag, inputCls, textareaCls } from "./kol-ui";
import { EMAIL_KIND, EMAIL_NOTE, EMAIL_STATUS, fmtDateTime, kolCall, todayKey, type EmailRow, type Overview, type SowVersion, type Visit, type VisitSettings } from "./kol-core";

type Draft = { title: string; sections: SowSection[]; closing: string };
const MAIL_KINDS: KolMailKind[] = ["visit_confirmed", "visit_reminder", "sow_updated", "visit_cancelled"];

const cleanSections = (sections: SowSection[]): SowSection[] =>
  sections.map((s) => ({ title: s.title.trim(), items: s.items.map((i) => i.trim()).filter(Boolean) })).filter((s) => s.title && s.items.length);
const draftOf = (sow: { title: string; sections: SowSection[]; closing?: string } | null | undefined): Draft =>
  ({ title: sow?.title ?? "Scope of Work", sections: (sow?.sections ?? [{ title: "Scope of Work", items: [""] }]).map((s) => ({ title: s.title, items: [...s.items] })), closing: sow?.closing ?? "" });
const copyText = async (text: string, label: string) => {
  try { await navigator.clipboard.writeText(text); toast.success(`${label} disalin.`); } catch { toast.error("Tidak bisa menyalin. Salin manual."); }
};

/* ---------- Editor SOW ---------- */
export function SowEditor({ value, onChange }: { value: Draft; onChange: (next: Draft) => void }) {
  const setSection = (index: number, patch: Partial<SowSection>) => onChange({ ...value, sections: value.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= value.sections.length) return;
    const next = [...value.sections];
    [next[index], next[to]] = [next[to]!, next[index]!];
    onChange({ ...value, sections: next });
  };
  return (
    <div className="space-y-4">
      <Field label="Judul SOW"><input className={inputCls} value={value.title} maxLength={160} onChange={(e) => onChange({ ...value, title: e.target.value })} /></Field>
      {value.sections.map((section, si) => (
        <div key={si} className="border border-[#e4e4e8] bg-white p-3">
          <div className="flex items-center gap-1.5">
            <input aria-label={`Judul bagian ${si + 1}`} className={`${inputCls} font-semibold`} value={section.title} maxLength={120} placeholder="Judul bagian, mis. Complimentary" onChange={(e) => setSection(si, { title: e.target.value })} />
            <Btn size="sm" variant="ghost" aria-label="Naikkan bagian" disabled={si === 0} onClick={() => move(si, -1)}><ArrowUp className="h-3.5 w-3.5" /></Btn>
            <Btn size="sm" variant="ghost" aria-label="Turunkan bagian" disabled={si === value.sections.length - 1} onClick={() => move(si, 1)}><ArrowDown className="h-3.5 w-3.5" /></Btn>
            <Btn size="sm" variant="danger" aria-label="Hapus bagian" disabled={value.sections.length <= 1} onClick={() => onChange({ ...value, sections: value.sections.filter((_, i) => i !== si) })}><Trash2 className="h-3.5 w-3.5" /></Btn>
          </div>
          <ul className="mt-2 space-y-1.5">
            {section.items.map((item, ii) => (
              <li key={ii} className="flex items-start gap-1.5">
                <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 bg-[#111114]" />
                <textarea aria-label={`Poin ${ii + 1} bagian ${si + 1}`} className={`${textareaCls} min-h-[40px]`} rows={item.length > 70 ? 3 : 1} value={item} maxLength={500} onChange={(e) => setSection(si, { items: section.items.map((x, i) => (i === ii ? e.target.value : x)) })} />
                <Btn size="sm" variant="ghost" aria-label="Hapus poin" onClick={() => setSection(si, { items: section.items.filter((_, i) => i !== ii) })}><Trash2 className="h-3.5 w-3.5" /></Btn>
              </li>
            ))}
          </ul>
          <Btn size="sm" className="mt-2" onClick={() => setSection(si, { items: [...section.items, ""] })}><Plus className="h-3.5 w-3.5" />Tambah poin</Btn>
        </div>
      ))}
      <Btn size="sm" disabled={value.sections.length >= 12} onClick={() => onChange({ ...value, sections: [...value.sections, { title: "", items: [""] }] })}><Plus className="h-3.5 w-3.5" />Tambah bagian</Btn>
      <Field label="Kalimat penutup" hint="Muncul di akhir SOW. Gunakan {{hari_tayang}} untuk batas tayang otomatis (dari pengaturan)."><textarea className={textareaCls} value={value.closing} maxLength={1000} onChange={(e) => onChange({ ...value, closing: e.target.value })} /></Field>
    </div>
  );
}

/* ---------- Panel "SOW & Email" ---------- */
export function SowSheet({ token, overview, onClose, onSaved }: { token: string | null; overview: Overview; onClose: () => void; onSaved: () => void }) {
  const active = overview.sowVersions.find((v) => v.is_active) ?? null;
  const settings = overview.settings;
  const [tab, setTab] = useState<"sow" | "history" | "contact" | "email">("sow");
  const [draft, setDraft] = useState<Draft>(() => draftOf(active));
  const [note, setNote] = useState("");
  const [apply, setApply] = useState(true);
  const [busy, setBusy] = useState("");
  const [mailKind, setMailKind] = useState<KolMailKind>("visit_confirmed");
  const [testTo, setTestTo] = useState("");
  const [form, setForm] = useState({ cafeName: settings?.cafe_name ?? "", address: settings?.address ?? "", mapsUrl: settings?.maps_url ?? "", waAdmin: settings?.wa_admin ?? "", waManager: settings?.wa_manager ?? "", days: String(settings?.post_deadline_days ?? 7) });

  const upcoming = useMemo(() => overview.visits.filter((v) => v.status === "confirmed" && v.booking_date >= todayKey() && !v.sow_customized).length, [overview.visits]);
  const clean = cleanSections(draft.sections);
  const valid = draft.title.trim().length >= 2 && clean.length > 0;
  const days = Number(form.days) || 7;
  const payload = useMemo(() => sampleKolPayload({
    cafeName: settings?.cafe_name ?? undefined, address: settings?.address ?? "", mapsUrl: settings?.maps_url ?? "", waAdmin: settings?.wa_admin ?? "", waManager: settings?.wa_manager ?? "",
    sow: { title: draft.title, sections: clean, closing: draft.closing, days },
  }), [settings, draft, clean, days]);
  const mail = useMemo(() => buildKolEmail(mailKind, payload), [mailKind, payload]);

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    try { await task(); } catch (e) { toast.error(e instanceof Error ? e.message : "Permintaan belum berhasil."); } finally { setBusy(""); }
  };
  const publish = () => run("publish", async () => {
    const result = await kolCall<{ version: number; applied: number }>("kol-portal-admin", "sow_publish", token, { title: draft.title, sections: clean, closing: draft.closing, note, apply });
    toast.success(`SOW versi ${result.version} terbit${apply ? ` dan diterapkan ke ${result.applied} booking` : ""}.`);
    setNote(""); onSaved();
  });
  const saveSettings = () => run("settings", async () => {
    await kolCall("kol-portal-admin", "settings_save", token, { cafeName: form.cafeName, address: form.address, mapsUrl: form.mapsUrl, waAdmin: form.waAdmin, waManager: form.waManager, postDeadlineDays: Number(form.days) });
    toast.success("Pengaturan kunjungan tersimpan."); onSaved();
  });
  const sendTest = () => run("test", async () => {
    await kolCall("kol-portal-admin", "email_test", token, { to: testTo, kind: mailKind });
    toast.success(`Email uji dikirim ke ${testTo}.`);
  });

  return (
    <Panel title="SOW & Email" description="Scope of Work yang diterima creator setelah visit dikonfirmasi, kontak kunjungan, dan pratinjau email." onClose={onClose} width="sm:max-w-2xl" footer={<Btn size="sm" onClick={onClose}>Tutup</Btn>}>
      <Chips value={tab} onChange={setTab} options={[{ key: "sow", label: "SOW" }, { key: "history", label: "Riwayat", count: overview.sowVersions.length }, { key: "contact", label: "Kontak & lokasi" }, { key: "email", label: "Pratinjau email" }]} />

      {tab === "sow" && (
        <div className="mt-4 space-y-4">
          <p className="text-[11.5px] leading-5 text-[#666672]">Versi aktif: <strong className="text-[#111114]">{active ? `v${active.version}` : "belum ada"}</strong>. Setiap perubahan menjadi versi baru; versi lama tersimpan di Riwayat.</p>
          <SowEditor value={draft} onChange={setDraft} />
          <Field label="Catatan perubahan (opsional)"><input className={inputCls} value={note} maxLength={500} placeholder="mis. Menambah complimentary" onChange={(e) => setNote(e.target.value)} /></Field>
          <label className="flex items-start gap-2 border border-[#e4e4e8] bg-[#fafafb] p-3 text-[12px] leading-5">
            <input type="checkbox" className="mt-1" checked={apply} onChange={(e) => setApply(e.target.checked)} />
            <span>Terapkan ke <strong>{upcoming}</strong> booking terkonfirmasi yang belum berlangsung, lalu kabari creator lewat email.<br /><span className="text-[#666672]">Booking yang SOW-nya diubah manual tidak ikut berubah.</span></span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" disabled={!valid || busy === "publish"} onClick={() => void publish()}><Send className="h-3.5 w-3.5" />{busy === "publish" ? "Menerbitkan…" : `Terbitkan versi ${(overview.sowVersions[0]?.version ?? 0) + 1}`}</Btn>
            <Btn disabled={!valid} onClick={() => void copyText(sowToWhatsApp({ title: draft.title, sections: clean, closing: draft.closing, days }), "Teks WhatsApp")}><Copy className="h-3.5 w-3.5" />Salin sebagai teks WhatsApp</Btn>
          </div>
        </div>
      )}

      {tab === "history" && (
        <ul className="mt-4 divide-y divide-[#ececf0] border border-[#e4e4e8] bg-white">
          {overview.sowVersions.length === 0 && <li className="p-4 text-xs text-[#666672]">Belum ada riwayat.</li>}
          {overview.sowVersions.map((v: SowVersion) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold">Versi {v.version} {v.is_active && <StatusTag color="#16a34a">Aktif</StatusTag>}</p>
                <p className="truncate text-[11px] text-[#666672]">{v.note || v.title} · {fmtDateTime(v.created_at)} · {v.created_by}</p>
              </div>
              {!v.is_active && <Btn size="sm" onClick={() => { setDraft(draftOf(v)); setNote(`Kembali ke isi versi ${v.version}`); setTab("sow"); }}><RotateCcw className="h-3.5 w-3.5" />Pakai lagi</Btn>}
            </li>
          ))}
        </ul>
      )}

      {tab === "contact" && (
        <div className="mt-4 space-y-3">
          <Field label="Nama tempat"><input className={inputCls} value={form.cafeName} onChange={(e) => setForm({ ...form, cafeName: e.target.value })} /></Field>
          <Field label="Alamat"><input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Link Google Maps"><input className={inputCls} inputMode="url" value={form.mapsUrl} placeholder="https://maps.app.goo.gl/…" onChange={(e) => setForm({ ...form, mapsUrl: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="WhatsApp admin"><input className={inputCls} inputMode="tel" value={form.waAdmin} placeholder="0812…" onChange={(e) => setForm({ ...form, waAdmin: e.target.value })} /></Field>
            <Field label="WhatsApp manager" hint={form.waManager ? undefined : "Belum diisi: baris Manager tidak ditampilkan di email."}><input className={inputCls} inputMode="tel" value={form.waManager} placeholder="0812…" onChange={(e) => setForm({ ...form, waManager: e.target.value })} /></Field>
          </div>
          <Field label="Batas tayang (hari setelah visit)" hint="Dipakai pada tanggal batas tayang dan teks {{hari_tayang}} di SOW."><input className={`${inputCls} max-w-[120px]`} type="number" min={1} max={60} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></Field>
          <Btn variant="primary" disabled={busy === "settings"} onClick={() => void saveSettings()}>{busy === "settings" ? "Menyimpan…" : "Simpan pengaturan"}</Btn>
        </div>
      )}

      {tab === "email" && (
        <div className="mt-4 space-y-3">
          <Chips value={mailKind} onChange={setMailKind} options={MAIL_KINDS.map((k) => ({ key: k, label: EMAIL_KIND[k] }))} />
          <div className="border border-[#e4e4e8] bg-white px-3"><KV label="Subjek">{mail.subject}</KV><KV label="Dari">Djiwa Tentram &lt;hello@mail.djiwatentram.web.id&gt;</KV></div>
          <iframe title="Pratinjau email" sandbox="" srcDoc={mail.html} className="h-[520px] w-full border border-[#e4e4e8] bg-white" />
          <p className="text-[11px] leading-5 text-[#666672]">Pratinjau memakai data contoh dan SOW pada editor. Email nyata memakai data booking dan SOW yang tersimpan.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Kirim email uji ke" className="min-w-[220px] flex-1"><input className={inputCls} type="email" value={testTo} placeholder="alamat@email.com" onChange={(e) => setTestTo(e.target.value)} /></Field>
            <Btn variant="primary" disabled={!testTo.includes("@") || busy === "test"} onClick={() => void sendTest()}><Mail className="h-3.5 w-3.5" />{busy === "test" ? "Mengirim…" : "Kirim uji"}</Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------- SOW pada satu booking ---------- */
export function BookingSow({ visit, token, onSaved }: { visit: Visit; token: string | null; onSaved: () => void }) {
  const sow = visit.sow_snapshot as SowSnapshot;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(sow));
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState("");
  const valid = draft.title.trim().length >= 2 && cleanSections(draft.sections).length > 0;
  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    try { await task(); onSaved(); } catch (e) { toast.error(e instanceof Error ? e.message : "SOW booking belum berubah."); } finally { setBusy(""); }
  };

  if (visit.status === "requested" || (!sow && visit.status !== "confirmed")) {
    return <p className="text-[11.5px] leading-5 text-[#666672]">SOW aktif disalin ke booking ini saat dikonfirmasi, lalu dikirim lewat email.</p>;
  }
  return (
    <div className="space-y-3">
      {sow ? (
        <div className="border border-[#e4e4e8] bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <StatusTag color="#2f6fdf">Versi {visit.sow_version ?? "?"}</StatusTag>
            {visit.sow_customized && <StatusTag color="#6d4fd8">Diubah manual</StatusTag>}
            {visit.post_deadline && <Label>Batas tayang {visit.post_deadline}</Label>}
          </div>
          {sow.sections.map((s) => (
            <div key={s.title} className="mt-2 first:mt-0">
              <p className="text-[12px] font-semibold">{s.title}</p>
              <ul className="list-disc pl-5 text-[12px] leading-5 text-[#444450]">{s.items.map((i, n) => <li key={n}>{i.replace(/\{\{\s*hari_tayang\s*\}\}/g, String(sow.days ?? 7))}</li>)}</ul>
            </div>
          ))}
        </div>
      ) : <p className="text-[11.5px] text-[#9b1c12]">Booking terkonfirmasi ini belum punya SOW. Pakai SOW terbaru di bawah.</p>}
      {editing ? (
        <div className="space-y-3 border border-[#e4e4e8] bg-[#fafafb] p-3">
          <SowEditor value={draft} onChange={setDraft} />
          <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Kabari creator lewat email</label>
          <div className="flex gap-2">
            <Btn variant="primary" size="sm" disabled={!valid || busy === "set"} onClick={() => void run("set", async () => { await kolCall("kol-portal-admin", "booking_sow_set", token, { id: visit.id, title: draft.title, sections: cleanSections(draft.sections), closing: draft.closing, notify }); toast.success("SOW booking diperbarui."); setEditing(false); })}>Simpan SOW booking</Btn>
            <Btn size="sm" onClick={() => setEditing(false)}>Batal</Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Btn size="sm" onClick={() => { setDraft(draftOf(sow)); setEditing(true); }}>Ubah SOW booking ini</Btn>
          <Btn size="sm" disabled={busy === "sync"} onClick={async () => { if (await requestAdminConfirm({ title: "Pakai SOW terbaru?", message: "SOW booking ini diganti dengan SOW aktif terbaru dan creator dikabari lewat email.", confirmText: "Pakai SOW terbaru" })) void run("sync", async () => { await kolCall("kol-portal-admin", "booking_sow_sync", token, { id: visit.id, notify: true }); toast.success("SOW booking mengikuti versi terbaru."); }); }}>Pakai SOW terbaru</Btn>
          {sow && <Btn size="sm" onClick={() => void copyText(sowToWhatsApp(sow, visit.kol_creators?.name), "Teks WhatsApp")}><Copy className="h-3.5 w-3.5" />Salin teks WhatsApp</Btn>}
        </div>
      )}
    </div>
  );
}

/* ---------- Riwayat email satu booking ---------- */
export function BookingEmails({ visit, emails, token, onSaved }: { visit: Visit; emails: EmailRow[]; token: string | null; onSaved: () => void }) {
  const rows = emails.filter((e) => e.booking_id === visit.id).sort((a, b) => b.id - a.id);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const defaultKind: KolMailKind = visit.status === "cancelled" ? "visit_cancelled" : "visit_confirmed";
  const act = async (key: string, action: string, payload: Record<string, unknown>, ok: string) => {
    setBusy(key); setError("");
    try { await kolCall("kol-portal-admin", action, token, payload); toast.success(ok); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Permintaan belum berhasil."); }
    finally { setBusy(""); }
  };
  return (
    <div className="space-y-2">
      {rows.length === 0 ? <p className="text-[11.5px] leading-5 text-[#666672]">{visit.status === "requested" ? "Email konfirmasi dikirim otomatis saat booking dikonfirmasi." : "Belum ada email untuk booking ini."}</p> : (
        <ul className="divide-y divide-[#ececf0] border border-[#e4e4e8] bg-white">
          {rows.map((r) => {
            const meta = EMAIL_STATUS[r.status] ?? { label: r.status, color: "#666672" };
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold">{EMAIL_KIND[r.kind] ?? r.kind}</p>
                  <p className="truncate text-[11px] text-[#666672]">{r.to_email ?? "—"} · {r.sent_at ? `terkirim ${fmtDateTime(r.sent_at)}` : `dijadwalkan ${fmtDateTime(r.scheduled_at)}`}{r.last_error ? ` · ${EMAIL_NOTE[r.last_error] ?? r.last_error}` : ""}</p>
                </div>
                <span className="flex items-center gap-1.5">
                  <StatusTag color={meta.color}>{meta.label}</StatusTag>
                  {r.status === "pending" && <Btn size="sm" variant="danger" disabled={busy === `s${r.id}`} onClick={() => void act(`s${r.id}`, "email_skip", { id: r.id }, "Email dibatalkan.")}>Batalkan</Btn>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <ErrorBox message={error} />}
      {visit.status !== "requested" && <Btn size="sm" disabled={busy === "resend"} onClick={() => void act("resend", "email_resend", { bookingId: visit.id, kind: defaultKind }, "Email masuk antrean dan segera dikirim.")}><Mail className="h-3.5 w-3.5" />Kirim ulang {EMAIL_KIND[defaultKind].toLowerCase()}</Btn>}
    </div>
  );
}

export type { VisitSettings };
