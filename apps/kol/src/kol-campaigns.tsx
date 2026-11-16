import { useEffect, useMemo, useState } from "react";
import { KxSheet } from "./kol-sheet";
import { errorText, kolApi, parseDay } from "./kol-lib";

type Campaign = {
  id: number; title: string; description?: string | null; location?: string | null; benefit_description?: string | null; deliverable_summary?: string | null;
  application_deadline?: string | null; start_date?: string | null; end_date?: string | null; status: string; assignment_id?: number | null; assignment_status?: string | null; brand_name?: string | null; category?: string | null;
};
type Proof = { id: number; campaign_assignment_id: number; deliverable_type: string; content_url: string; status: string; review_note?: string | null; campaign_title?: string };

const FILTERS: Array<[string, string]> = [["all", "Semua"], ["invited", "Diundang"], ["active", "Aktif"], ["completed", "Selesai"]];
const STATUS: Record<string, [string, string]> = {
  invited: ["Diundang", "kx-pill--warn"], accepted: ["Diterima", "kx-pill--info"], active: ["Berjalan", "kx-pill--info"], completed: ["Selesai", "kx-pill--ok"],
  declined: ["Ditolak", ""], cancelled: ["Dibatalkan", ""], approved: ["Selesai", "kx-pill--ok"], paid: ["Selesai", "kx-pill--ok"],
};
const PROOF: Record<string, [string, string]> = { submitted: ["Menunggu review", "kx-pill--warn"], needs_revision: ["Perlu revisi", "kx-pill--warn"], approved: ["Disetujui", "kx-pill--ok"], rejected: ["Ditolak", ""] };
const statusOf = (c: Campaign): [string, string] => STATUS[c.assignment_status || ""] || ["Dibuka", "kx-pill--info"];
const day = (v?: string | null) => (v ? parseDay(String(v).slice(0, 10)).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : null);

export function CampaignsTab({ campaigns, refresh }: { campaigns: Campaign[]; refresh: () => Promise<void> }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const list = useMemo(() => campaigns.filter(c => filter === "all" || (filter === "invited" && c.assignment_status === "invited") || (filter === "active" && ["accepted", "active"].includes(c.assignment_status || "")) || (filter === "completed" && ["completed", "approved", "paid"].includes(c.assignment_status || ""))), [campaigns, filter]);
  const respond = async (c: Campaign, status: "accepted" | "declined") => {
    setBusy(c.id); setError("");
    try { await kolApi(`/portal/campaigns/${c.assignment_id}/respond`, { method: "POST", body: JSON.stringify({ status }) }); await refresh(); }
    catch (e) { setError(errorText(e, "Jawaban belum terkirim. Coba lagi.")); } finally { setBusy(null); }
  };
  const current = open ? campaigns.find(c => c.id === open.id) || open : null;

  return (
    <div>
      <div className="kx-hs" role="group" aria-label="Filter kampanye">{FILTERS.map(([k, l]) => <button type="button" key={k} className="kx-chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
      {error && <p role="alert" className="kx-note kx-note--err" style={{ marginBottom: 10 }}>{error}</p>}
      {list.length ? list.map(c => {
        const [label, tone] = statusOf(c);
        const deadline = day(c.application_deadline || c.end_date);
        return (
          <article key={c.id} className="kx-post">
            <button type="button" style={{ display: "block", width: "100%", textAlign: "left" }} onClick={() => setOpen(c)} aria-label={`Detail kampanye ${c.title}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}><b className="kx-h2" style={{ display: "block" }}>{c.title}</b><span className="kx-sub">{c.brand_name || c.category || "Djiwa Tentram"}{c.location ? ` · ${c.location}` : ""}</span></div>
                <span className={`kx-pill ${tone || ""}`} style={tone ? undefined : { background: "#eceef2", color: "var(--kx-muted)" }}>{label}</span>
              </div>
              <p className="kx-clamp" style={{ color: "var(--kx-muted)", fontSize: 13.5 }}>{c.description || "Detail kampanye ada di halaman detail."}</p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 12.5 }}>
                <span><span className="kx-sub">Benefit </span><b>{c.benefit_description || "Dibicarakan bersama"}</b></span>
                {deadline && <span><span className="kx-sub">Sampai </span><b>{deadline}</b></span>}
              </div>
            </button>
            {c.assignment_status === "invited" && (
              <div className="kx-row2" style={{ marginTop: 12 }}>
                <button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" disabled={busy === c.id} onClick={() => void respond(c, "declined")}>Tolak</button>
                <button type="button" className="kx-btn kx-btn--sm" disabled={busy === c.id} onClick={() => void respond(c, "accepted")}>{busy === c.id ? "Mengirim…" : "Terima"}</button>
              </div>
            )}
          </article>
        );
      }) : <div className="kx-card" style={{ textAlign: "center", padding: 28 }}><b style={{ display: "block" }}>{filter === "all" ? "Belum ada kampanye" : "Belum ada kampanye di filter ini"}</b><span className="kx-sub">Kami kabari lewat notifikasi saat ada kampanye yang cocok untukmu.</span></div>}
      {current && <CampaignSheet campaign={current} onClose={() => setOpen(null)} onChanged={refresh} />}
    </div>
  );
}

function CampaignSheet({ campaign: c, onClose, onChanged }: { campaign: Campaign; onClose: () => void; onChanged: () => Promise<void> }) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [url, setUrl] = useState("");
  const [type, setType] = useState("");
  const [shot, setShot] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const canSubmit = ["accepted", "active"].includes(c.assignment_status || "");
  const [label, tone] = statusOf(c);
  const loadProofs = () => kolApi<Proof[]>("/portal/proofs").then(all => setProofs(all.filter(p => p.campaign_assignment_id === c.assignment_id))).catch(() => undefined);
  useEffect(() => { if (c.assignment_id && (canSubmit || c.assignment_status === "completed")) void loadProofs(); }, [c.assignment_id]);
  const valid = (v: string) => /^https?:\/\/\S{4,}$/i.test(v.trim());
  const submit = async () => {
    if (!valid(url)) { setMsg({ tone: "err", text: "Link konten harus diawali http:// atau https://" }); return; }
    if (shot.trim() && !valid(shot)) { setMsg({ tone: "err", text: "Link screenshot tidak valid." }); return; }
    setBusy(true); setMsg(null);
    try {
      await kolApi("/portal/proofs", { method: "POST", body: JSON.stringify({ assignmentId: c.assignment_id, contentUrl: url.trim(), deliverableType: type.trim() || "Konten", screenshotUrl: shot.trim() || undefined }) });
      setUrl(""); setType(""); setShot(""); setMsg({ tone: "ok", text: "Bukti konten terkirim. Tim akan mereview." });
      await loadProofs(); await onChanged();
    } catch (e) { setMsg({ tone: "err", text: errorText(e, "Bukti konten belum terkirim.") }); } finally { setBusy(false); }
  };
  const [editing, setEditing] = useState<Proof | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const revise = async () => {
    if (!editing) return;
    if (!valid(editUrl)) { setMsg({ tone: "err", text: "Link konten harus diawali http:// atau https://" }); return; }
    try { await kolApi(`/portal/proofs/${editing.id}`, { method: "PATCH", body: JSON.stringify({ contentUrl: editUrl.trim() }) }); setEditing(null); await loadProofs(); await onChanged(); setMsg({ tone: "ok", text: "Revisi terkirim." }); }
    catch (e) { setMsg({ tone: "err", text: errorText(e, "Revisi belum terkirim.") }); }
  };
  return (
    <KxSheet title="Detail kampanye" onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}><b className="kx-h1" style={{ fontSize: 22 }}>{c.title}</b><span className={`kx-pill ${tone}`}>{label}</span></div>
      <p className="kx-lead" style={{ whiteSpace: "pre-wrap" }}>{c.description || "Brief kampanye belum tersedia."}</p>
      <div className="kx-group" style={{ marginTop: 14 }}>
        <div className="kx-kv"><span>Benefit</span><b>{c.benefit_description || "Dibicarakan bersama"}</b></div>
        {c.deliverable_summary && <div className="kx-kv"><span>Yang dibuat</span><b>{c.deliverable_summary}</b></div>}
        {c.location && <div className="kx-kv"><span>Lokasi</span><b>{c.location}</b></div>}
        {c.application_deadline && <div className="kx-kv"><span>Batas daftar</span><b>{day(c.application_deadline)}</b></div>}
        {(c.start_date || c.end_date) && <div className="kx-kv"><span>Periode</span><b>{[day(c.start_date), day(c.end_date)].filter(Boolean).join(" – ")}</b></div>}
      </div>
      {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={`kx-note ${msg.tone === "err" ? "kx-note--err" : ""}`} style={{ marginTop: 12 }}>{msg.text}</p>}
      {(canSubmit || proofs.length > 0) && (
        <>
          <div className="kx-section">Bukti konten</div>
          {proofs.length > 0 && (
            <div className="kx-group" style={{ marginBottom: 12 }}>
              {proofs.map(p => {
                const [pl, pt] = PROOF[p.status] || [p.status, ""];
                return (
                  <div key={p.id} className="kx-grow" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                    <span className="kx-main"><b>{p.deliverable_type}</b><small style={{ overflowWrap: "anywhere" }}><a href={p.content_url} target="_blank" rel="noreferrer" style={{ color: "var(--kx-blue-ink)" }}>{p.content_url}</a></small>{p.review_note && <small style={{ color: "var(--kx-warn)" }}>Catatan: {p.review_note}</small>}</span>
                    <span className={`kx-pill ${pt}`}>{pl}</span>
                    {p.status === "needs_revision" && (editing?.id === p.id
                      ? <div style={{ width: "100%", marginTop: 6 }}><input className="kx-input" aria-label="Link konten revisi" inputMode="url" autoCapitalize="none" value={editUrl} onChange={e => setEditUrl(e.target.value)} /><div className="kx-row2" style={{ marginTop: 8 }}><button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" onClick={() => setEditing(null)}>Batal</button><button type="button" className="kx-btn kx-btn--sm" onClick={() => void revise()}>Kirim</button></div></div>
                      : <button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" style={{ marginTop: 6 }} onClick={() => { setEditing(p); setEditUrl(p.content_url); }}>Kirim revisi</button>)}
                  </div>
                );
              })}
            </div>
          )}
          {canSubmit && (
            <div className="kx-card">
              <label className="kx-label" htmlFor="kp-url" style={{ marginTop: 0 }}>Link konten</label>
              <input id="kp-url" className="kx-input" inputMode="url" autoCapitalize="none" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@kamu/video/…" />
              <label className="kx-label" htmlFor="kp-type">Jenis konten <em>(opsional)</em></label>
              <input id="kp-type" className="kx-input" value={type} onChange={e => setType(e.target.value)} placeholder="mis. Reels, TikTok, Story" />
              <label className="kx-label" htmlFor="kp-shot">Link screenshot insight <em>(opsional)</em></label>
              <input id="kp-shot" className="kx-input" inputMode="url" autoCapitalize="none" value={shot} onChange={e => setShot(e.target.value)} placeholder="https://…" />
              <button type="button" className="kx-btn" style={{ marginTop: 14 }} disabled={busy || !url.trim()} onClick={submit}>{busy ? "Mengirim…" : "Kirim bukti konten"}</button>
            </div>
          )}
        </>
      )}
    </KxSheet>
  );
}
