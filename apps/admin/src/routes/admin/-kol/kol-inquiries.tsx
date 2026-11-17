// Inquiry kolaborasi: permintaan brand/klien yang masuk dari profil publik creator.
// Hanya admin yang bisa melihat isi brief dan mengubah statusnya (aksi inquiry_update).
import { Building2, Mail, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Btn, Chips, EmptyBlock, ErrorBox, Field, KV, Label, Loading, NoAccess, Page, PageHeader, Panel, SearchBox, SectionLabel, StatusTag, Tag, textareaCls,
} from "./kol-ui";
import { INQUIRY_STATUS, atUsername, fmtDateTime, kolCall, useKolData, waUrl, type Inquiry } from "./kol-core";

const PREFERRED: Record<string, string> = { email: "Email", phone: "Telepon", either: "Email atau telepon" };
const errText = (e: unknown) => (e instanceof Error ? e.message : "Perubahan belum tersimpan.");

export function KolInquiriesPage() {
  const { token, canManage, loading, error, overview, reload, ready } = useKolData();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return overview.inquiries.filter((i) => {
      if (filter !== "all" && i.status !== filter) return false;
      if (!q) return true;
      return [i.business_name, i.contact_name, i.contact_email, i.contact_phone, i.brief, i.kol_creators?.name].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [overview.inquiries, filter, query]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of overview.inquiries) map.set(i.status, (map.get(i.status) ?? 0) + 1);
    return map;
  }, [overview.inquiries]);

  const active = openId !== null ? overview.inquiries.find((i) => i.id === openId) ?? null : null;
  if (!canManage) return <NoAccess />;

  return (
    <Page>
      <PageHeader
        title="Inquiry"
        description="Permintaan kolaborasi dari brand atau klien yang masuk lewat profil publik creator KOL."
        count={overview.inquiries.length ? <Tag color="#2f6fdf">{overview.inquiries.length}</Tag> : null}
        actions={<Btn onClick={() => void reload()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Muat ulang</Btn>}
      />

      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      <div className="space-y-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Cari brand, kontak, atau isi brief" />
        <Chips value={filter} onChange={setFilter} options={[
          { key: "all", label: "Semua", count: overview.inquiries.length },
          ...Object.entries(INQUIRY_STATUS).map(([key, meta]) => ({ key, label: meta.label, count: counts.get(key) ?? 0 })),
        ]} />
      </div>

      {loading && !ready ? <Loading rows={4} /> : rows.length === 0 ? (
        <EmptyBlock title="Belum ada inquiry" hint="Inquiry muncul saat brand mengirim brief lewat tombol kolaborasi di profil publik creator." />
      ) : (
        <div className="border border-[#e4e4e8] bg-white">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_130px_120px] gap-3 border-b border-[#ececf0] px-4 py-2 lg:grid">
            {["Brand", "Kontak", "Untuk creator", "Masuk", "Status"].map((h) => <Label key={h}>{h}</Label>)}
          </div>
          <ul className="divide-y divide-[#ececf0]">
            {rows.map((i) => {
              const meta = INQUIRY_STATUS[i.status] ?? { label: i.status, color: "#666672" };
              return (
                <li key={i.id}>
                  <button type="button" onClick={() => setOpenId(i.id)} className="grid w-full grid-cols-1 items-center gap-2 px-4 py-3 text-left transition hover:bg-[#fafafb] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_130px_120px] lg:gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center border border-[#e4e4e8] bg-[#fafafb] text-[#666672]"><Building2 className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-semibold text-[#111114]">{i.business_name}</span>
                        <span className="block truncate text-[11px] text-[#666672]">{i.contact_name}</span>
                      </span>
                    </span>
                    <span className="hidden min-w-0 lg:block">
                      <span className="block truncate text-[11.5px] text-[#444450]">{i.contact_email || "—"}</span>
                      <span className="block truncate text-[11px] text-[#666672]">{i.contact_phone || "—"}</span>
                    </span>
                    <span className="hidden truncate text-[11.5px] text-[#444450] lg:block">{i.kol_creators?.name ?? i.kol_id}</span>
                    <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.06em] text-[#666672] lg:block">{fmtDateTime(i.created_at)}</span>
                    <span><StatusTag color={meta.color}>{meta.label}</StatusTag></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {active && <InquiryPanel inquiry={active} token={token} onClose={() => setOpenId(null)} onSaved={() => void reload()} />}
    </Page>
  );
}

function InquiryPanel({ inquiry, token, onClose, onSaved }: { inquiry: Inquiry; token: string | null; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(inquiry.status);
  const [note, setNote] = useState(inquiry.admin_note ?? "");
  const [busy, setBusy] = useState(false);
  const meta = INQUIRY_STATUS[inquiry.status] ?? { label: inquiry.status, color: "#666672" };
  const wa = waUrl(inquiry.contact_phone, `Halo ${inquiry.contact_name}, soal inquiry kolaborasi untuk ${inquiry.kol_creators?.name ?? "creator"} di Djiwa Tentram.`);

  const save = async () => {
    setBusy(true);
    try {
      await kolCall("kol-portal-admin", "inquiry_update", token, { id: inquiry.id, status, adminNote: note });
      toast.success("Inquiry diperbarui");
      onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };

  return (
    <Panel
      title={inquiry.business_name}
      description={`${inquiry.contact_name} · ${PREFERRED[inquiry.preferred_contact] ?? inquiry.preferred_contact}`}
      onClose={onClose}
      footer={<><Btn size="sm" onClick={onClose}>Tutup</Btn><Btn size="sm" variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan"}</Btn></>}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-[#111114]">{inquiry.business_name}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">Masuk {fmtDateTime(inquiry.created_at)}</p>
        </div>
        <StatusTag color={meta.color}>{meta.label}</StatusTag>
      </div>

      <SectionLabel>Kontak brand</SectionLabel>
      <div className="border border-[#e4e4e8] bg-white px-3">
        <KV label="Nama">{inquiry.contact_name}</KV>
        <KV label="Email">{inquiry.contact_email ? <a className="text-[#2f6fdf] underline" href={`mailto:${inquiry.contact_email}`}>{inquiry.contact_email}</a> : "—"}</KV>
        <KV label="Telepon">{inquiry.contact_phone ? <a className="text-[#2f6fdf] underline" href={`tel:${inquiry.contact_phone}`}>{inquiry.contact_phone}</a> : "—"}</KV>
        <KV label="Preferensi">{PREFERRED[inquiry.preferred_contact] ?? inquiry.preferred_contact}</KV>
        <KV label="Creator">{inquiry.kol_creators?.name ?? inquiry.kol_id} <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">{atUsername(inquiry.kol_creators?.username)}</span></KV>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {inquiry.contact_email && <a href={`mailto:${inquiry.contact_email}`} className="inline-flex min-h-8 items-center gap-1.5 border border-[#cfcfd6] bg-white px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2f5d9e]"><Mail className="h-3.5 w-3.5" />Email</a>}
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 border border-[#cfcfd6] bg-white px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#166534]"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>}
        {inquiry.contact_phone && <a href={`tel:${inquiry.contact_phone}`} className="inline-flex min-h-8 items-center gap-1.5 border border-[#cfcfd6] bg-white px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#444450]"><Phone className="h-3.5 w-3.5" />Telepon</a>}
      </div>

      <SectionLabel>Brief</SectionLabel>
      <p className="whitespace-pre-line border border-[#e4e4e8] bg-[#fafafb] p-3 text-[12px] leading-5 text-[#111114]">{inquiry.brief}</p>

      <SectionLabel>Penanganan</SectionLabel>
      <Field label="Status">
        <select className="h-10 w-full border border-[#cfcfd6] bg-white px-3 text-sm text-[#111114] outline-none transition focus:border-[#111114] focus:ring-2 focus:ring-[#111114]/10" value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(INQUIRY_STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
      </Field>
      <div className="mt-2">
        <Label tone="ink">Catatan admin</Label>
        <textarea aria-label="Catatan admin" className={`${textareaCls} mt-1`} value={note} maxLength={2000} placeholder="Hasil follow-up, penawaran, atau alasan penolakan." onChange={(e) => setNote(e.target.value)} />
      </div>
    </Panel>
  );
}
