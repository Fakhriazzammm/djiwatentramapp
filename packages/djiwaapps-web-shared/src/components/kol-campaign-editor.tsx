import { useEffect, useId, useState } from "react";
import {
  CAMPAIGN_PROOF_PLATFORMS,
  type CampaignDraft,
  type CampaignFields,
  type CampaignSow,
} from "../../../../supabase/functions/_shared/kol-campaign";

export const KOL_CAMPAIGN_ORIGIN = "https://kol.djiwatentram.web.id";

type EditorFields = {
  applicationMode: CampaignFields["application_mode"];
  coverUrl: string;
  terms: string[];
  sow: CampaignSow;
  proofPlatforms: string[];
};

export function campaignEditorFields(campaign: Partial<CampaignFields> | null): EditorFields {
  return {
    applicationMode: campaign?.application_mode ?? (campaign ? "invite" : "open"),
    coverUrl: campaign?.cover_url ?? "",
    terms: campaign?.terms ?? [],
    sow: campaign?.sow ?? { title: "Scope of Work", sections: [], closing: "" },
    proofPlatforms: campaign?.proof_platforms ?? [],
  };
}

export function visitCampaignTemplate(activeSow: CampaignSow): EditorFields & {
  title: string; location: string; benefitDescription: string; deliverableSummary: string; description: string;
} {
  const days = activeSow.days ?? 7;
  return {
    title: "Visit Djiwa Tentram",
    location: "Djiwa Tentram Cafe & Resto, Tasikmalaya",
    benefitDescription: "2 makanan dan 2 minuman saat visit.",
    deliverableSummary: "1 video TikTok yang sama ditayangkan ulang di Instagram Reels. Kirim kedua tautan setelah tayang.",
    description: "Datang ke Djiwa Tentram di Tasikmalaya, cicipi menu kami, dan ceritakan pengalamanmu dengan gaya kontenmu sendiri. Tunjukkan alur Djiwa App dari login dan self-order sampai checkout.",
    applicationMode: "visit",
    coverUrl: "/campaign-images/visit-djiwa-tentram.jpg",
    terms: [
      `Saya setuju mengikuti SOW dan menayangkan konten paling lambat ${days} hari setelah visit.`,
      "Saya akan mencantumkan akun serta lokasi Djiwa Tentram dan mengirim tautan TikTok dan Instagram Reels di portal.",
      "Saya siap hadir sesuai jadwal yang dikonfirmasi dan akan menghubungi tim lebih awal jika berhalangan.",
    ],
    sow: { ...activeSow, days },
    proofPlatforms: ["TikTok", "Instagram"],
  };
}

type EditorProps = {
  fields: EditorFields;
  title: string;
  slug: string;
  inputClass: string;
  buttonClass: string;
  onChange: (next: Partial<EditorFields>) => void;
  onTemplate?: () => void;
  generate: (brief: string) => Promise<CampaignDraft>;
  onDraft: (draft: CampaignDraft) => void;
};

export function CampaignEditorExtras({ fields, title, slug, inputClass, buttonClass, onChange, onTemplate, generate, onDraft }: EditorProps) {
  const id = useId();
  const [brief, setBrief] = useState("");
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);

  const setSow = (next: Partial<CampaignSow>) => onChange({ sow: { ...fields.sow, ...next } });
  const draft = async () => {
    setGenerating(true);
    setFeedback(null);
    const facts = brief.trim() || [
      ...fields.sow.sections.flatMap((section) => section.items),
      ...fields.terms,
    ].filter(Boolean).join("\n");
    try {
      onDraft(await generate(facts));
      setFeedback({ error: false, text: "Draf dimasukkan ke deskripsi dan ringkasan konten. Keduanya bisa diedit." });
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "Draf AI belum tersedia." });
    } finally { setGenerating(false); }
  };

  const coverUrl = fields.coverUrl.startsWith("/campaign-images/") ? KOL_CAMPAIGN_ORIGIN + fields.coverUrl : fields.coverUrl;
  const previewUrl = /^[a-z0-9-]+$/.test(slug) ? `${KOL_CAMPAIGN_ORIGIN}/campaigns/${slug}` : null;

  return (
    <div style={{ display: "grid", gap: 14, marginBlock: 16 }}>
      {onTemplate && <div><button type="button" className={buttonClass} onClick={onTemplate}>Pakai template Visit</button></div>}
      <div>
        <label htmlFor={id + "-mode"}>Cara creator bergabung</label>
        <select id={id + "-mode"} className={inputClass} value={fields.applicationMode}
          onChange={e => onChange({ applicationMode: e.target.value as EditorFields["applicationMode"] })}>
          <option value="open">Pendaftaran terbuka</option>
          <option value="visit">Pendaftaran dengan kalender Visit</option>
          <option value="invite">Undangan creator</option>
        </select>
        {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8 }}>Buka halaman creator ↗</a>}
      </div>
      <div>
        <label htmlFor={id + "-cover"}>URL sampul kampanye</label>
        <input id={id + "-cover"} className={inputClass} type="text" inputMode="url" placeholder="https://…" value={fields.coverUrl}
          maxLength={2048} onChange={e => onChange({ coverUrl: e.target.value })} />
        {coverUrl.startsWith("https://") && <img src={coverUrl} alt="Pratinjau sampul" loading="lazy" style={{ display: "block", marginTop: 8, width: "100%", maxWidth: 320, aspectRatio: "12/7", objectFit: "cover", borderRadius: 12 }} />}
      </div>
      <fieldset style={{ display: "grid", gap: 8 }}>
        <legend>Scope of Work</legend>
        <label htmlFor={id + "-sow-title"}>Judul SOW</label>
        <input id={id + "-sow-title"} className={inputClass} value={fields.sow.title} maxLength={160} onChange={e => setSow({ title: e.target.value })} />
        {fields.sow.sections.map((section, index) => (
          <div key={index} style={{ display: "grid", gap: 6, paddingBlock: 8 }}>
            <input className={inputClass} aria-label={`Judul bagian SOW ${index + 1}`} placeholder="Judul bagian" value={section.title} maxLength={120}
              onChange={e => setSow({ sections: fields.sow.sections.map((s, i) => i === index ? { ...s, title: e.target.value } : s) })} />
            <textarea className={inputClass} aria-label={`Poin bagian SOW ${index + 1}`} rows={3} placeholder="Satu poin per baris"
              value={section.items.join("\n")} onChange={e => setSow({ sections: fields.sow.sections.map((s, i) => i === index ? { ...s, items: e.target.value.split("\n") } : s) })} />
            <div><button type="button" className={buttonClass} onClick={() => setSow({ sections: fields.sow.sections.filter((_, i) => i !== index) })}>Hapus bagian {index + 1}</button></div>
          </div>
        ))}
        <div><button type="button" className={buttonClass} disabled={fields.sow.sections.length >= 12}
          onClick={() => setSow({ sections: [...fields.sow.sections, { title: "", items: [""] }] })}>+ Bagian SOW</button></div>
        <label htmlFor={id + "-closing"}>Catatan penutup</label>
        <textarea id={id + "-closing"} className={inputClass} rows={2} value={fields.sow.closing ?? ""} maxLength={1000}
          onChange={e => setSow({ closing: e.target.value })} />
        {fields.applicationMode === "visit" && <>
          <label htmlFor={id + "-days"}>Batas tayang setelah visit (hari)</label>
          <input id={id + "-days"} className={inputClass} type="number" min={1} max={60} placeholder="7" value={fields.sow.days ?? ""}
            onChange={e => setSow({ days: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </>}
      </fieldset>
      <div>
        <label htmlFor={id + "-terms"}>Syarat dan ketentuan</label>
        <textarea id={id + "-terms"} className={inputClass} rows={4} placeholder="Satu ketentuan per baris"
          value={fields.terms.join("\n")} onChange={e => onChange({ terms: e.target.value.split("\n") })} />
      </div>
      {fields.applicationMode !== "invite" && <fieldset>
        <legend>Bukti konten yang wajib disetujui</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {CAMPAIGN_PROOF_PLATFORMS.map(platform => {
            const selected = fields.proofPlatforms.includes(platform);
            return <label key={platform} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={selected} onChange={() => onChange({ proofPlatforms: selected
                ? fields.proofPlatforms.filter(p => p !== platform) : [...fields.proofPlatforms, platform] })} />{platform}
            </label>;
          })}
        </div>
      </fieldset>}
      <div>
        <label htmlFor={id + "-brief"}>Bahan draf AI</label>
        <textarea id={id + "-brief"} className={inputClass} rows={2} value={brief} maxLength={6000}
          placeholder="Tulis poin singkat, atau gunakan SOW dan ketentuan yang sudah diisi" onChange={e => setBrief(e.target.value)} />
        <button type="button" className={buttonClass} disabled={generating || !title.trim() || (!brief.trim() && !fields.sow.sections.length)}
          onClick={() => void draft()}>{generating ? "Membuat draf…" : "Buat draf dengan AI"}</button>
        {feedback && <p role={feedback.error ? "alert" : "status"} style={{ marginTop: 8 }}>{feedback.text}</p>}
      </div>
    </div>
  );
}

export type CampaignApplication = {
  id: number; name: string; username?: string; status: string; booking_date?: string; booking_time?: string; review_note?: string;
};

const decisionLabels: Record<string, string> = {
  pending: "Menunggu review", approved: "Diterima", rejected: "Ditolak", cancelled: "Dibatalkan",
};

export function CampaignApplications({ campaignId, load, review, inputClass, buttonClass }: {
  campaignId: number;
  load: () => Promise<CampaignApplication[]>;
  review: (decision: { id: number; approve: boolean; note: string }) => Promise<void>;
  inputClass: string;
  buttonClass: string;
}) {
  const [items, setItems] = useState<CampaignApplication[] | null>(null);
  const [selection, setSelection] = useState<CampaignApplication | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    setError("");
    try { setItems(await load()); }
    catch (e) { setError(e instanceof Error ? e.message : "Gagal memuat pengajuan."); }
  };
  useEffect(() => {
    let active = true;
    load().then(values => { if (active) setItems(values); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Gagal memuat pengajuan."); });
    return () => { active = false; };
  }, [campaignId]);

  const decide = async (approve: boolean) => {
    if (!selection) return;
    setPending(true);
    try {
      await review({ id: selection.id, approve, note });
      setSelection(null);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Keputusan belum tersimpan."); }
    finally { setPending(false); }
  };

  return (
    <section style={{ marginBlock: 16 }}>
      <h3>Pengajuan creator</h3>
      {error && <p role="alert">{error} <button type="button" className={buttonClass} onClick={() => void reload()}>Muat ulang</button></p>}
      {!error && items === null && <p role="status">Memuat pengajuan…</p>}
      {items?.length === 0 && <p>Belum ada pengajuan.</p>}
      {items?.map(item => (
        <div key={item.id} style={{ display: "grid", gap: 4, paddingBlock: 8, borderBottom: "1px solid var(--line, #e4e4e8)" }}>
          <b>{item.name || item.username}</b>
          <span>{decisionLabels[item.status] || item.status}{item.booking_date ? ` · ${item.booking_date} ${item.booking_time?.slice(0, 5) ?? ""} WIB` : ""}</span>
          {item.review_note && <small>{item.review_note}</small>}
          {item.status === "pending" && selection?.id !== item.id &&
            <div><button type="button" className={buttonClass} onClick={() => { setSelection(item); setNote(""); }}>Tinjau pengajuan</button></div>}
          {selection?.id === item.id && <div style={{ display: "grid", gap: 8 }}>
            <input className={inputClass} aria-label="Catatan pengajuan" maxLength={1000} placeholder="Catatan untuk creator (opsional)" value={note} onChange={e => setNote(e.target.value)} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button type="button" className={buttonClass} disabled={pending} onClick={() => setSelection(null)}>Kembali</button>
              <button type="button" className={buttonClass} disabled={pending} onClick={() => void decide(false)}>Tolak</button>
              <button type="button" className={buttonClass} disabled={pending} onClick={() => void decide(true)}>{item.booking_date ? "Konfirmasi visit" : "Setujui pengajuan"}</button>
            </div>
          </div>}
        </div>
      ))}
    </section>
  );
}
