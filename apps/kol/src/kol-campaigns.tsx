import { useEffect, useMemo, useRef, useState } from "react";
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
  const [tried, setTried] = useState(false);
  const [formInView, setFormInView] = useState(false);
  const visit = c.application_mode === "visit";
  const existing = calendar.find((row) => row.own && ["requested", "confirmed"].includes(row.status));
  const applyingAgain = c.application_status === "cancelled";
  const inviteWithTerms = c.status === "published" && c.application_mode === "invite" && c.assignment_status === "invited" && Boolean(c.terms?.length);
  const legacyAssignment = !c.application_status && ["accepted", "active", "completed"].includes(c.assignment_status || "");
  const canApply = !legacyAssignment && (c.can_apply || inviteWithTerms) && (!c.application_status || applyingAgain);
  const visibleSow = !applyingAgain && c.sow_snapshot ? c.sow_snapshot : c.sow;
  const visibleTerms = !applyingAgain && c.terms_snapshot?.length ? c.terms_snapshot : c.terms;
  const [label, tone] = statusOf(c);
  const appStatus = applyingAgain && !sent ? null : (c.application_status ?? (sent ? "pending" : null));
  const applyRef = useRef<HTMLElement | null>(null);
  const steps = [
    ...(visit ? [{ key: "date", label: existing ? "Jadwal kunjungan sudah ada" : "Pilih tanggal kunjungan di kalender", done: Boolean(existing || picked.date) }] : []),
    ...(visit && !existing ? [{ key: "time", label: "Pilih jam datang (11.00–17.00)", done: Boolean(picked.time) }] : []),
    { key: "terms", label: "Setujui SOW serta syarat dan ketentuan", done: terms },
    ...(visit ? [{ key: "attend", label: "Setujui komitmen hadir", done: attend }, { key: "noshow", label: "Setujui konsekuensi bila tidak hadir", done: noShow }] : []),
  ];
  const missing = steps.filter(step => !step.done);
  useEffect(() => {
    const el = applyRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setFormInView(Boolean(entry?.isIntersecting)), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [canApply, sent]);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
    await refresh?.();
  });

  const submitApply = () => {
    if (missing.length) {
      setTried(true);
      const first = missing[0]!.key;
      document.getElementById(first === "date" || first === "time" ? "apply-date" : "apply-consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    void apply();
  };

  return (
    <article className="kx-campaign-detail">
      <a className="kx-link" href="/campaigns">‹ Semua kampanye</a>
      {c.cover_url && <img className="kx-campaign-cover" src={c.cover_url} alt="" width="720" height="420" />}
      <div className="kx-campaign-heading"><h2 className="kx-h1">{c.title}</h2><span className={`kx-pill ${tone}`}>{label}</span></div>
      {appStatus && <ApplicationStatus campaign={c} status={appStatus} picked={picked} visit={visit} />}
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
      {canApply && refresh && !sent && (
        <section id="apply" ref={applyRef} style={{ scrollMarginTop: 12 }}>
          <h3 className="kx-section" style={{ marginTop: 4 }}>Daftar kampanye</h3>
          {visit && <div id="apply-date" style={{ scrollMarginTop: 12 }}><h3 className="kx-section">1 · Jadwal kunjungan</h3>
            {existing ? <p className="kx-note">Gunakan jadwalmu yang sudah ada, {longDate(existing.booking_date)} pukul {dotTime(existing.booking_time)} WIB.</p>
              : <VisitPicker rows={calendar} date={picked.date} time={picked.time} onChange={setPicked} startDate={c.start_date} endDate={c.end_date} />}
          </div>}
          <div id="apply-consent" style={{ scrollMarginTop: 12 }}>
          <h3 className="kx-section">{visit ? "2 · Persetujuan" : "Persetujuan"}</h3>
          <label className="kx-check"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>Saya menyetujui SOW serta syarat dan ketentuan kampanye ini.</span></label>
          {visit && <>
            <label className="kx-check"><input type="checkbox" checked={attend} onChange={e => setAttend(e.target.checked)} /><span>Saya berkomitmen hadir sesuai jadwal dan akan memberi kabar jika berhalangan.</span></label>
            <label className="kx-check"><input type="checkbox" checked={noShow} onChange={e => setNoShow(e.target.checked)} /><span>{CONSENT_NO_SHOW}</span></label>
          </>}
          </div>
          <div className={`kx-todo ${tried && missing.length ? "kx-todo--err" : missing.length ? "" : "kx-todo--ok"}`} role="status">
            <b>{missing.length ? `Lengkapi ${missing.length} hal lagi untuk mendaftar` : "Semua sudah lengkap, siap dikirim"}</b>
            <ul>{steps.map(step => <li key={step.key} className={step.done ? "is-done" : ""}><span aria-hidden>{step.done ? "✓" : "○"}</span>{step.label}</li>)}</ul>
          </div>
          <button type="button" className={`kx-btn ${missing.length ? "kx-btn--soft" : ""}`} aria-disabled={Boolean(missing.length) || busy} disabled={busy} onClick={submitApply}>
            {busy ? "Mengirim…" : existing && visit ? "Kirim pendaftaran dengan jadwal ini" : inviteWithTerms ? "Setujui dan terima undangan" : "Kirim pendaftaran"}
          </button>
        </section>
      )}
      {canApply && !sent && !(refresh && formInView) && (
        <div className={`kx-cta ${refresh ? "kx-cta--tabbed" : ""}`}>
          {refresh
            ? <a className="kx-btn" href="#apply" onClick={(e) => { e.preventDefault(); document.getElementById("apply")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Daftar sekarang{c.reward ? ` · ${rupiah(c.reward.ratePer1000)} / 1.000 view` : ""}</a>
            : login ? <button type="button" className="kx-btn" disabled={busy} onClick={() => void change(login)}>{busy ? "Membuka…" : `Masuk untuk daftar${c.reward ? ` · ${rupiah(c.reward.ratePer1000)} / 1.000 view` : ""}`}</button> : null}
        </div>
      )}
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

function ApplicationStatus({ campaign: c, status, picked, visit }: { campaign: Campaign; status: string; picked: { date: string | null; time: string | null }; visit: boolean }) {
  const date = c.visit_date || picked.date, time = c.visit_time || picked.time;
  const rejected = status === "rejected", cancelled = status === "cancelled", approved = status === "approved";
  if (cancelled) return null;
  const head = rejected
    ? { icon: "✕", tone: "err", title: "Pengajuan belum bisa diterima", text: c.review_note ? `Catatan tim: ${c.review_note}` : "Tim belum bisa menerima pengajuan ini. Hubungi admin Djiwa Tentram bila ada pertanyaan." }
    : approved
      ? { icon: "✓", tone: "ok", title: "Pengajuan diterima", text: visit ? "Jadwal kunjunganmu sudah dikonfirmasi. Datang sesuai jadwal, lalu kirim link kontenmu di bawah." : "Kamu sudah bergabung. Kirim link kontenmu di bawah setelah tayang." }
      : { icon: "⏳", tone: "wait", title: "Pengajuan terkirim, menunggu konfirmasi", text: "Pengajuanmu sudah tersimpan. Tim Djiwa Tentram akan mengonfirmasi, biasanya dalam 1 hari kerja. Kami kabari lewat notifikasi portal dan email." };
  const steps: Array<[string, boolean, boolean]> = [
    ["Pengajuan terkirim", true, false],
    ["Konfirmasi tim", approved, !approved && !rejected],
    ...(visit ? [["Datang ke visit", c.visit_status === "completed", approved && c.visit_status !== "completed"] as [string, boolean, boolean]] : []),
    ["Kirim link konten", false, approved && (!visit || c.visit_status === "completed")],
    ...(c.reward ? [[`Reward dibayar H+${c.reward.settleDays}`, false, false] as [string, boolean, boolean]] : []),
  ];
  return (
    <section className={`kx-status kx-status--${head.tone}`} role="status" aria-live="polite">
      <div className="kx-status-head"><span className="kx-status-ic" aria-hidden>{head.icon}</span><div><b>{head.title}</b><p>{head.text}</p></div></div>
      {visit && date && !rejected && <div className="kx-status-when"><span>Jadwal kunjungan</span><b>{longDate(date)}{time ? ` · ${dotTime(time)} WIB` : ""}</b></div>}
      {!rejected && <ol className="kx-status-steps">{steps.map(([label, done, now]) => <li key={label} className={done ? "is-done" : now ? "is-now" : ""}><span aria-hidden>{done ? "✓" : now ? "●" : "○"}</span>{label}</li>)}</ol>}
      <div className="kx-status-actions">
        {visit && !rejected && <a className="kx-btn" href="/visit">Lihat jadwal visit</a>}
        <a className="kx-btn kx-btn--ghost" href="/campaigns">Kembali ke semua kampanye</a>
      </div>
    </section>
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
