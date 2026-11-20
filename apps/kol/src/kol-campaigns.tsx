import { useEffect, useMemo, useState } from "react";
import { CONSENT_NO_SHOW, dotTime, errorText, kolApi, longDate, parseDay, type VisitRow } from "./kol-lib";
import { VisitPicker } from "./kol-visit";
import { SowCard } from "./kol-sow";
import type { CampaignSow } from "../../../supabase/functions/_shared/kol-campaign";
import { ProofChecks, RewardBox, rupiah, type RewardInfo } from "./kol-rewards";
import { ShareCampaign } from "./kol-share";
import { CalendarDays, Gift, MapPin, Users } from "lucide-react";

export type Campaign = {
  id: number; slug: string; title: string; description?: string | null; location?: string | null; benefit_description?: string | null; deliverable_summary?: string | null;
  application_deadline?: string | null; start_date?: string | null; end_date?: string | null; status: string; assignment_id?: number | null; assignment_status?: string | null; brand_name?: string | null; category?: string | null;
  revision: string; can_apply: boolean; application_mode: "invite" | "open" | "visit"; cover_url?: string | null;
  terms: string[]; sow?: CampaignSow | null; proof_platforms: string[]; reward?: RewardInfo | null;
  application_status?: string | null; terms_snapshot?: string[] | null; sow_snapshot?: CampaignSow | null;
  agreed_proof_platforms?: string[] | null; review_note?: string | null;
  updated_visit_sow?: CampaignSow | null; application_requires_visit?: boolean | null; visit_status?: string | null; visit_date?: string | null; visit_time?: string | null; post_deadline?: string | null;
};
type Proof = { id: number; campaign_assignment_id: number; deliverable_type: string; content_url: string; status: string; review_note?: string | null; campaign_title?: string; video_id?: string | null; posted_at?: string | null; settle_due_at?: string | null };

const FILTERS: Array<[string, string]> = [["all", "Semua"], ["invited", "Diundang"], ["active", "Aktif"], ["completed", "Selesai"]];
const STATUS: Record<string, [string, string]> = {
  invited: ["Diundang", "kx-pill--warn"], accepted: ["Diterima", "kx-pill--info"], active: ["Berjalan", "kx-pill--info"], completed: ["Selesai", "kx-pill--ok"],
  declined: ["Ditolak", ""], cancelled: ["Dibatalkan", ""], approved: ["Selesai", "kx-pill--ok"], paid: ["Selesai", "kx-pill--ok"],
};
const PROOF: Record<string, [string, string]> = { submitted: ["Menunggu review", "kx-pill--warn"], needs_revision: ["Perlu revisi", "kx-pill--warn"], approved: ["Disetujui", "kx-pill--ok"], rejected: ["Ditolak", ""] };
const APPLICATION: Record<string, [string, string]> = {
  pending: ["Menunggu konfirmasi", "kx-pill--warn"], approved: ["Diterima", "kx-pill--ok"],
  rejected: ["Pengajuan ditolak", ""], cancelled: ["Dibatalkan", ""],
};
const statusOf = (c: Campaign): [string, string] =>
  (c.application_status === "pending" || c.application_status === "rejected" || c.application_status === "cancelled"
    ? APPLICATION[c.application_status]
    : STATUS[c.assignment_status || ""])
  || (c.status === "published" && (c.application_mode === "invite" || c.can_apply) ? ["Dibuka", "kx-pill--info"] : ["Ditutup", ""]);
const detailsUrl = (c: Campaign) => `/campaigns/${encodeURIComponent(c.slug)}`;
const day = (v?: string | null) => (v ? parseDay(String(v).slice(0, 10)).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : null);

export function CampaignsTab({ campaigns, refresh }: { campaigns: Campaign[]; refresh?: () => Promise<void> }) {
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const list = useMemo(() => campaigns.filter(c => filter === "all" || (filter === "invited" && c.assignment_status === "invited") || (filter === "active" && ["accepted", "active"].includes(c.assignment_status || "")) || (filter === "completed" && ["completed", "approved", "paid"].includes(c.assignment_status || ""))), [campaigns, filter]);
  const respond = async (c: Campaign, status: "accepted" | "declined") => {
    setBusy(c.id); setError("");
    try { await kolApi(`/portal/campaigns/${c.assignment_id}/respond`, { method: "POST", body: JSON.stringify({ status }) }); await refresh?.(); }
    catch (e) { setError(errorText(e, "Jawaban belum terkirim. Coba lagi.")); } finally { setBusy(null); }
  };

  return (
    <div>
      {refresh && <div className="kx-hs" role="group" aria-label="Filter kampanye">{FILTERS.map(([k, l]) => <button type="button" key={k} className="kx-chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>}
      {error && <p role="alert" className="kx-note kx-note--err" style={{ marginBottom: 10 }}>{error}</p>}
      {list.length ? list.map(c => {
        const [label, tone] = statusOf(c);
        const deadline = day(c.application_deadline || c.end_date);
        return (
          <article key={c.id} className="kx-post">
            <a className="kx-campaign-link" href={detailsUrl(c)}>
              <div className={`kx-cov ${c.cover_url ? "" : "kx-cov--empty"}`}>
                {c.cover_url && <img className="kx-campaign-cover" src={c.cover_url} alt="" loading="lazy" width="720" height="420" />}
                <span className={`kx-pill kx-cov-status ${tone || ""}`} style={tone ? undefined : { background: "#ffffffe6", color: "var(--kx-muted)" }}>{label}</span>
                {c.reward && <span className="kx-cov-reward"><b>{rupiah(c.reward.ratePer1000)}</b><small> / 1.000 view</small></span>}
              </div>
              <b className="kx-h2 kx-card-title">{c.title}</b>
              <p className="kx-clamp kx-card-desc">{c.description || "Detail kampanye ada di halaman detail."}</p>
              <ul className="kx-facts">
                {c.location && <li><MapPin size={15} aria-hidden /><span>{c.location}</span></li>}
                {c.benefit_description && <li><Gift size={15} aria-hidden /><span>{c.benefit_description}</span></li>}
                {deadline && <li><CalendarDays size={15} aria-hidden /><span>Daftar sampai {deadline}</span></li>}
                {c.reward && <li className={c.reward.slotsLeft > 0 ? "" : "kx-facts--warn"}><Users size={15} aria-hidden /><span>{c.reward.slotsLeft > 0 ? `${c.reward.slotsLeft} dari ${c.reward.slotsTotal} slot tersisa` : "Kuota penuh"}</span></li>}
              </ul>
              <span className="kx-cta2">Lihat detail <span aria-hidden>›</span></span>
            </a>
            {refresh && c.assignment_status === "invited" && c.application_mode === "invite" && !c.terms?.length && (
              <div className="kx-row2" style={{ marginTop: 12 }}>
                <button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" disabled={busy === c.id} onClick={() => void respond(c, "declined")}>Tolak</button>
                <button type="button" className="kx-btn kx-btn--sm" disabled={busy === c.id} onClick={() => void respond(c, "accepted")}>{busy === c.id ? "Mengirim…" : "Terima"}</button>
              </div>
            )}
          </article>
        );
      }) : <div className="kx-card" style={{ textAlign: "center", padding: 28 }}><b style={{ display: "block" }}>{filter === "all" ? "Belum ada kampanye" : "Belum ada kampanye di filter ini"}</b><span className="kx-sub">Kami kabari lewat notifikasi saat ada kampanye yang cocok untukmu.</span></div>}
    </div>
  );
}

export function CampaignDetail({ campaign: c, calendar = [], refresh, login }: {
  campaign: Campaign; calendar?: VisitRow[]; refresh?: () => Promise<void>; login?: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<{ date: string | null; time: string | null }>({ date: null, time: null });
  const [terms, setTerms] = useState(false);
  const [attend, setAttend] = useState(false);
  const [noShow, setNoShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const visit = c.application_mode === "visit";
  const existing = calendar.find((row) => row.own && ["requested", "confirmed"].includes(row.status));
  const applyingAgain = c.application_status === "cancelled";
  const inviteWithTerms = c.status === "published" && c.application_mode === "invite" && c.assignment_status === "invited" && Boolean(c.terms?.length);
  const legacyAssignment = !c.application_status && ["accepted", "active", "completed"].includes(c.assignment_status || "");
  const canApply = !legacyAssignment && (c.can_apply || inviteWithTerms) && (!c.application_status || applyingAgain);
  const visibleSow = !applyingAgain && c.sow_snapshot ? c.sow_snapshot : c.sow;
  const visibleTerms = !applyingAgain && c.terms_snapshot?.length ? c.terms_snapshot : c.terms;
  const [label, tone] = statusOf(c);
  const change = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (e) { setError(errorText(e, e instanceof Error ? e.message : "Permintaan belum berhasil.")); }
    finally { setBusy(false); }
  };
  const apply = () => change(async () => {
    try {
      await kolApi(`/portal/campaigns/${encodeURIComponent(c.slug)}/apply`, {
        method: "POST",
        body: JSON.stringify({
          revision: c.revision, consentTerms: terms, consentAttendance: attend, consentNoShow: noShow,
          bookingDate: picked.date, bookingTime: picked.time, useExisting: Boolean(existing),
        }),
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (["DATE_ALREADY_BOOKED", "CAMPAIGN_TERMS_CHANGED", "ACTIVE_VISIT_NOT_FOUND"].includes(code || "")) {
        setPicked({ date: null, time: null });
        setTerms(false); setAttend(false); setNoShow(false);
        await refresh?.();
      }
      throw e;
    }
    setSent(true);
    await refresh?.();
  });

  return (
    <article className="kx-campaign-detail">
      <a className="kx-link" href="/campaigns">‹ Semua kampanye</a>
      {c.cover_url && <img className="kx-campaign-cover" src={c.cover_url} alt="" width="720" height="420" />}
      <div className="kx-campaign-heading"><h2 className="kx-h1">{c.title}</h2><span className={`kx-pill ${tone}`}>{label}</span></div>
      <ShareCampaign campaign={c} />
      <p className="kx-lead kx-campaign-copy">{c.description}</p>
      {c.reward && <RewardBox reward={c.reward} />}
      <section>
        <h3 className="kx-section" style={{ marginTop: 4 }}>Ringkasan</h3>
        <div className="kx-group">
          {c.location && <div className="kx-kv"><span>Lokasi</span><b>{c.location}</b></div>}
          {c.benefit_description && <div className="kx-kv"><span>Benefit</span><b>{c.benefit_description}</b></div>}
          {c.deliverable_summary && <div className="kx-kv"><span>Konten</span><b>{c.deliverable_summary}</b></div>}
          {c.application_deadline && <div className="kx-kv"><span>Batas daftar</span><b>{day(c.application_deadline)}</b></div>}
          {(c.start_date || c.end_date) && <div className="kx-kv"><span>Periode</span><b>{[day(c.start_date), day(c.end_date)].filter(Boolean).join(" – ")}</b></div>}
          {c.visit_date && !applyingAgain && <div className="kx-kv"><span>Jadwal visit</span><b>{longDate(c.visit_date)} · {dotTime(c.visit_time)} WIB</b></div>}
          {c.post_deadline && !applyingAgain && <div className="kx-kv"><span>Batas tayang konten</span><b>{longDate(c.post_deadline)}</b></div>}
        </div>
      </section>
      {visibleSow && <details className="kx-acc">
        <summary><span>Scope of Work</span><span aria-hidden className="kx-acc-i">›</span></summary>
        <div className="kx-acc-b">
          <SowCard sow={!applyingAgain && c.updated_visit_sow ? c.updated_visit_sow : visibleSow} />
          {!applyingAgain && c.updated_visit_sow && <details><summary>Lihat SOW saat pengajuan</summary><SowCard sow={visibleSow} /></details>}
        </div>
      </details>}
      {visibleTerms?.length > 0 && <details className="kx-acc">
        <summary><span>Syarat dan ketentuan ({visibleTerms.length})</span><span aria-hidden className="kx-acc-i">›</span></summary>
        <div className="kx-acc-b"><ol className="kx-campaign-terms" style={{ padding: "4px 4px 4px 22px" }}>{visibleTerms.map((term, i) => <li key={i}>{term}</li>)}</ol></div>
      </details>}
      {c.review_note && <p className="kx-note">Catatan tim: {c.review_note}</p>}
      {error && <p role="alert" className="kx-note kx-note--err">{error}</p>}
      {sent && c.application_status && !applyingAgain && <p role="status" className="kx-note">Pengajuanmu tersimpan.</p>}
      {canApply && refresh && !sent && (
        <section id="apply" style={{ scrollMarginTop: 12 }}>
          {visit && <><h3 className="kx-section">Jadwal kunjungan</h3>
            {existing ? <p className="kx-note">Gunakan jadwalmu yang sudah ada, {longDate(existing.booking_date)} pukul {dotTime(existing.booking_time)} WIB.</p>
              : <VisitPicker rows={calendar} date={picked.date} time={picked.time} onChange={setPicked} startDate={c.start_date} endDate={c.end_date} />}
          </>}
          <h3 className="kx-section">Persetujuan</h3>
          <label className="kx-check"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>Saya menyetujui SOW serta syarat dan ketentuan kampanye ini.</span></label>
          {visit && <>
            <label className="kx-check"><input type="checkbox" checked={attend} onChange={e => setAttend(e.target.checked)} /><span>Saya berkomitmen hadir sesuai jadwal dan akan memberi kabar jika berhalangan.</span></label>
            <label className="kx-check"><input type="checkbox" checked={noShow} onChange={e => setNoShow(e.target.checked)} /><span>{CONSENT_NO_SHOW}</span></label>
          </>}
          <button type="button" className="kx-btn" onClick={() => void apply()} disabled={busy || !terms || (visit && (!attend || !noShow || (!existing && (!picked.date || !picked.time))))}>
            {busy ? "Mengirim…" : existing && visit ? "Ajukan dengan jadwal ini" : inviteWithTerms ? "Setujui dan terima undangan" : "Ajukan kampanye"}
          </button>
        </section>
      )}
      {canApply && !sent && (
        <div className={`kx-cta ${refresh ? "kx-cta--tabbed" : ""}`}>
          {refresh ? <a className="kx-btn" href="#apply">Daftar{c.reward ? ` · ${rupiah(c.reward.ratePer1000)} / 1.000 view` : ""}</a> : null}
        </div>
      )}
      {canApply && !refresh && login && <button type="button" className="kx-btn" disabled={busy} onClick={() => void change(login)}>{busy ? "Membuka…" : "Masuk untuk daftar"}</button>}
      {refresh && c.assignment_status === "invited" && c.application_mode === "invite" && (
        <div className="kx-row2">
          {(["declined", "accepted"] as const).filter(status => status === "declined" || !inviteWithTerms).map(status => (
            <button type="button" key={status} className={`kx-btn ${status === "declined" ? "kx-btn--ghost" : ""}`} disabled={busy}
              onClick={() => void change(async () => {
                await kolApi(`/portal/campaigns/${c.assignment_id}/respond`, { method: "POST", body: JSON.stringify({ status }) });
                await refresh();
              })}>{status === "declined" ? "Tolak" : "Terima"}</button>
          ))}
        </div>
      )}
      {refresh && c.assignment_id && <CampaignProofs campaign={c} onChanged={refresh} />}
    </article>
  );
}

export function PublicCampaigns({ slug, loginError, onApply }: { slug?: string; loginError?: string; onApply: () => Promise<void> }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    kolApi<Campaign[] | Campaign>(slug ? `/public-campaigns/${encodeURIComponent(slug)}` : "/public-campaigns", { signal: controller.signal })
      .then((data) => setCampaigns(Array.isArray(data) ? data : [data]))
      .catch((e) => { if (!controller.signal.aborted) setError(errorText(e, "Kampanye belum bisa dimuat.")); });
    return () => controller.abort();
  }, [slug]);
  return (
    <div className="kx kx-wrap"><main className="kx-view" style={{ paddingTop: 28 }}>
      {!slug && <h1 className="kx-h1">Kampanye Djiwa Tentram</h1>}
      {loginError && <p className="kx-note kx-note--err" role="alert">{loginError}</p>}
      {error ? <><p role="alert" className="kx-note kx-note--err">{error}</p><a className="kx-link" href={slug ? "/campaigns" : "/"}>{slug ? "Lihat semua kampanye" : "Ke portal creator"}</a></>
        : campaigns === null ? <p className="kx-sub" role="status">Memuat kampanye…</p>
        : slug && campaigns[0] ? <CampaignDetail campaign={campaigns[0]} login={onApply} />
        : <CampaignsTab campaigns={campaigns} />}
    </main></div>
  );
}

function CampaignProofs({ campaign: c, onChanged }: { campaign: Campaign; onChanged: () => Promise<void> }) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [url, setUrl] = useState("");
  const [type, setType] = useState("");
  const [shot, setShot] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const platforms = c.agreed_proof_platforms ?? [];
  const waitsForVisit = c.application_requires_visit === true && c.visit_status !== "completed";
  const canSubmit = !waitsForVisit && ["accepted", "active"].includes(c.assignment_status || "");
  const openPlatforms = platforms.filter((platform) => !proofs.some((p) => p.deliverable_type === platform && p.status !== "rejected"));
  const loadProofs = () => kolApi<Proof[]>("/portal/proofs").then(all => setProofs(all.filter(p => p.campaign_assignment_id === c.assignment_id))).catch(() => undefined);
  useEffect(() => { if (c.assignment_id && (canSubmit || c.assignment_status === "completed")) void loadProofs(); }, [c.assignment_id, canSubmit, c.assignment_status]);
  const valid = (v: string) => /^https?:\/\/\S{4,}$/i.test(v.trim());
  const submit = async () => {
    if (!valid(url)) { setMsg({ tone: "err", text: "Link konten harus diawali http:// atau https://" }); return; }
    if (shot.trim() && !valid(shot)) { setMsg({ tone: "err", text: "Link screenshot tidak valid." }); return; }
    setBusy(true); setMsg(null);
    try {
      await kolApi("/portal/proofs", { method: "POST", body: JSON.stringify({ assignmentId: c.assignment_id, contentUrl: url.trim(), deliverableType: type.trim() || "Konten", screenshotUrl: shot.trim() || undefined }) });
      setUrl(""); setType(""); setShot(""); setMsg({ tone: "ok", text: "Bukti konten terkirim. Tim akan mereview." });
      await loadProofs(); await onChanged();
    } catch (e) { await loadProofs(); setMsg({ tone: "err", text: errorText(e, "Bukti konten belum terkirim.") }); } finally { setBusy(false); }
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
    <div>
      {waitsForVisit && ["accepted", "active"].includes(c.assignment_status || "") &&
        <p className="kx-note">Kirim bukti konten setelah tim menandai visit selesai.</p>}
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
                    {c.reward && c.reward.platforms.includes(p.deliverable_type) && <div style={{ width: "100%" }}><ProofChecks proof={p} /></div>}
                    {p.status === "needs_revision" && (editing?.id === p.id
                      ? <div style={{ width: "100%", marginTop: 6 }}><input className="kx-input" aria-label="Link konten revisi" inputMode="url" autoCapitalize="none" value={editUrl} onChange={e => setEditUrl(e.target.value)} /><div className="kx-row2" style={{ marginTop: 8 }}><button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" onClick={() => setEditing(null)}>Batal</button><button type="button" className="kx-btn kx-btn--sm" onClick={() => void revise()}>Kirim</button></div></div>
                      : <button type="button" className="kx-btn kx-btn--ghost kx-btn--sm" style={{ marginTop: 6 }} onClick={() => { setEditing(p); setEditUrl(p.content_url); }}>Kirim revisi</button>)}
                  </div>
                );
              })}
            </div>
          )}
          {canSubmit && (platforms.length === 0 || openPlatforms.length > 0) && (
            <div className="kx-card">
              <label className="kx-label" htmlFor="kp-url" style={{ marginTop: 0 }}>Link konten</label>
              <input id="kp-url" className="kx-input" inputMode="url" autoCapitalize="none" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@kamu/video/…" />
              {platforms.length > 0 ? <>
                <label className="kx-label" htmlFor="kp-type">Platform</label>
                <select id="kp-type" className="kx-input" value={type} onChange={e => setType(e.target.value)}>
                  <option value="">Pilih platform</option>
                  {openPlatforms.map((platform) => <option key={platform}>{platform}</option>)}
                </select>
              </> : <>
                <label className="kx-label" htmlFor="kp-type">Jenis konten <em>(opsional)</em></label>
                <input id="kp-type" className="kx-input" value={type} onChange={e => setType(e.target.value)} placeholder="mis. Reels, TikTok, Story" />
              </>}
              <label className="kx-label" htmlFor="kp-shot">Link screenshot insight <em>(opsional)</em></label>
              <input id="kp-shot" className="kx-input" inputMode="url" autoCapitalize="none" value={shot} onChange={e => setShot(e.target.value)} placeholder="https://…" />
              <button type="button" className="kx-btn" style={{ marginTop: 14 }} disabled={busy || !url.trim() || (platforms.length > 0 && !openPlatforms.includes(type))} onClick={submit}>{busy ? "Mengirim…" : "Kirim bukti konten"}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
