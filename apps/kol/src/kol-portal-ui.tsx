import { useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, Home, LogOut, Sparkles, UserCircle, Users } from "lucide-react";
import { VisitPicker } from "./kol-visit";
import { KxSheet } from "./kol-sheet";
import { AvatarImg } from "./kol-avatar";
import { SowCard, VisitDetails, useVisitInfo } from "./kol-sow";
import { CONSENT_NO_SHOW, errorText, kolApi, logoutKol, longDate, dotTime, type VisitRow } from "./kol-lib";

export type PortalTabKey = "home" | "community" | "campaigns" | "calendar" | "profile";
export type PortalProfileData = {
  name: string; username: string; status?: string; avatar_url?: string | null; display_name?: string | null; slug?: string | null; bio?: string | null;
  public_availability?: string | null; platforms: Array<{ platform: string; username: string; followers: number }>; portfolio: Array<any>;
};
type SessionUser = { user: { id: string; name?: string | null; email?: string | null; image?: string | null } };
const TAB_PATH: Record<PortalTabKey, string> = { home: "/", community: "/komunitas", campaigns: "/campaigns", calendar: "/visit", profile: "/profil" };
export const portalPath = (tab: PortalTabKey, invite?: string | null) => (tab === "calendar" && invite ? `${TAB_PATH.calendar}?invite=${encodeURIComponent(invite)}` : TAB_PATH[tab]);
export function tabFromPath(path: string): PortalTabKey {
  const route = path.replace(/\/+$/, "") || "/";
  return (Object.entries(TAB_PATH).find(([, p]) => p === route)?.[0] as PortalTabKey) || "home";
}
const statusLabel = (s: string) => (s === "requested" ? "Menunggu konfirmasi" : s === "confirmed" ? "Terkonfirmasi" : s === "completed" ? "Selesai" : s);
const statusTone = (s: string) => (s === "confirmed" || s === "completed" ? "kx-pill--ok" : "kx-pill--warn");

export function Avatar({ session, profile, size = 44 }: { session: SessionUser; profile?: PortalProfileData | null; size?: number }) {
  const name = profile?.display_name || profile?.name || session.user.name || "Creator";
  return <AvatarImg url={profile?.avatar_url || session.user.image} name={name} size={size} />;
}

export function PortalHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="kx-large" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>{subtitle && <p className="kx-sub" style={{ margin: 0 }}>{subtitle}</p>}<h1 className="kx-h1">{title}</h1></div>
      <button type="button" className="kx-more" style={{ margin: 0, background: "#fff", boxShadow: "0 1px 2px #0000000d" }} aria-label="Keluar dari akun" onClick={() => setAsking(true)}><LogOut size={19} /></button>
      {asking && (
        <KxSheet title="Keluar dari akun?" onClose={() => setAsking(false)}>
          <p className="kx-lead" style={{ marginTop: 0 }}>Kamu akan kembali ke layar masuk. Data dan jadwalmu tetap tersimpan.</p>
          <div className="kx-row2" style={{ marginTop: 16 }}>
            <button type="button" className="kx-btn kx-btn--ghost" onClick={() => setAsking(false)}>Batal</button>
            <button type="button" className="kx-btn" style={{ background: "var(--kx-bad)" }} onClick={() => void logoutKol()}>Keluar</button>
          </div>
        </KxSheet>
      )}
    </div>
  );
}

export function PortalTabBar({ tab, onSelect, pending, invite }: { tab: PortalTabKey; onSelect: (t: PortalTabKey) => void; pending: number; invite?: string | null }) {
  const items: Array<[PortalTabKey, string, typeof Home]> = [["home", "Beranda", Home], ["community", "Komunitas", Users], ["campaigns", "Kampanye", FileText], ["calendar", "Visit", CalendarDays], ["profile", "Profil", UserCircle]];
  const active = tab;
  return (
    <nav className="kx-tabbar" aria-label="Navigasi Creator Portal">
      {items.map(([key, label, Icon]) => (
        <a key={key} href={portalPath(key, invite)} className="kx-tab" aria-current={active === key ? "page" : undefined}
          onClick={e => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onSelect(key); }}>
          <Icon size={21} strokeWidth={active === key ? 2.4 : 1.9} />{label}
          {key === "home" && pending > 0 && <span className="kx-badge" aria-label={`${pending} tugas profil belum selesai`}>{pending}</span>}
        </a>
      ))}
    </nav>
  );
}

/* ---------- Beranda ---------- */
export function HomeTab({ session, profile, own, campaigns, onNavigate }: { session: SessionUser; profile: PortalProfileData | null; own: VisitRow | undefined; campaigns: any[]; onNavigate: (t: PortalTabKey) => void }) {
  const tasks = useMemo(() => [
    { key: "socials", done: Boolean(profile?.platforms?.length), title: "Akun media sosial", sub: "Terisi dari pendaftaran", to: "profile" as PortalTabKey },
    { key: "avatar", done: Boolean(session.user.image || profile?.avatar_url), title: "Foto profil", sub: "Pakai foto akun Google atau unggah", to: "profile" as PortalTabKey },
    { key: "bio", done: Boolean(profile?.bio?.trim()), title: "Bio singkat", sub: "Ceritakan gaya kontenmu", to: "profile" as PortalTabKey },
    { key: "slug", done: Boolean(profile?.slug?.trim()), title: "Link profil publik", sub: `djiwatentram.web.id/${profile?.slug || "namamu"}`, to: "profile" as PortalTabKey },
  ], [profile, session.user.image]);
  const pct = Math.round(tasks.filter(t => t.done).length / tasks.length * 100);
  const nextCampaign = campaigns.find(c => c.assignment_status === "invited") || campaigns.find(c => c.status === "published" && !c.assignment_id);
  return (
    <div>
      <Notifications />
      <div className="kx-group" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><b className="kx-h2">Lengkapi profilmu</b><span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.03em" }}>{pct}%</span></div>
        <div className="kx-prog" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
        <p className="kx-sub" style={{ margin: "0 0 4px" }}>{pct === 100 ? "Lengkap! Profilmu sudah siap dilihat brand dan creator lain." : "Profilmu publik. Lengkapi agar mudah dikenal brand dan creator lain."}</p>
      </div>
      <div className="kx-group" style={{ marginTop: 10 }}>
        {tasks.map(t => (
          <button type="button" key={t.key} className="kx-grow" onClick={() => onNavigate(t.to)}>
            <span className="kx-box" data-on={t.done} style={{ borderRadius: "50%" }}>✓</span>
            <span className="kx-main"><b style={t.done ? { color: "var(--kx-muted)", textDecoration: "line-through" } : undefined}>{t.title}</b><small>{t.sub}</small></span>
            <span className="kx-chev">›</span>
          </button>
        ))}
      </div>
      <div className="kx-section">Visit ke Djiwa Tentram</div>
      {own ? (
        <div className="kx-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><b className="kx-h2">Jadwal visit-mu</b><span className={`kx-pill ${statusTone(own.status)}`}>{statusLabel(own.status)}</span></div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}><span className="kx-ico"><CalendarDays size={18} /></span><div className="kx-main"><b>{longDate(own.booking_date)}</b><small>Pukul {dotTime(own.booking_time)} WIB · review menu &amp; buat konten</small></div></div>
          {own.status === "confirmed" && own.post_deadline && <p className="kx-sub" style={{ margin: "10px 0 0" }}>Batas tayang konten: <b style={{ color: "var(--kx-ink)" }}>{longDate(own.post_deadline)}</b></p>}
          <button type="button" className={`kx-btn kx-btn--sm ${own.status === "confirmed" ? "" : "kx-btn--ghost"}`} style={{ marginTop: 12 }} onClick={() => onNavigate("calendar")}>{own.status === "confirmed" ? "Lihat SOW & detail visit" : "Lihat jadwal & KOL lain"}</button>
        </div>
      ) : (
        <div className="kx-card"><p style={{ margin: 0, fontSize: 14 }}>Kamu belum punya jadwal visit aktif.</p><button type="button" className="kx-btn kx-btn--sm" style={{ marginTop: 10 }} onClick={() => onNavigate("calendar")}>Pilih jadwal visit</button></div>
      )}

      <div className="kx-section">Kampanye untukmu</div>
      {nextCampaign ? (
        <div className="kx-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b className="kx-h2">{nextCampaign.title}</b><span className="kx-pill kx-pill--info">{nextCampaign.assignment_status === "invited" ? "Undangan" : "Dibuka"}</span></div>
          {(nextCampaign.benefit_description || nextCampaign.description) && <p className="kx-sub" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>{nextCampaign.benefit_description || nextCampaign.description}</p>}
          <button type="button" className="kx-btn kx-btn--sm" style={{ marginTop: 10 }} onClick={() => onNavigate("campaigns")}>Lihat detail</button>
        </div>
      ) : <div className="kx-card kx-sub">Belum ada kampanye. Kami kabari lewat notifikasi saat ada yang cocok.</div>}
    </div>
  );
}


/* ---------- Pemberitahuan (mis. "Visit terkonfirmasi") ---------- */
type Notice = { id: number; type: string; title: string; body: string; read_at: string | null; created_at: string };
function Notifications() {
  const [items, setItems] = useState<Notice[]>([]);
  useEffect(() => { let live = true; kolApi<Notice[]>("/portal/notifications").then(r => live && setItems(Array.isArray(r) ? r.filter(n => !n.read_at).slice(0, 3) : [])).catch(() => undefined); return () => { live = false; }; }, []);
  if (!items.length) return null;
  const dismiss = async (id?: number) => {
    setItems(prev => (id ? prev.filter(n => n.id !== id) : []));
    try { await kolApi("/portal/notifications/read", { method: "POST", body: JSON.stringify(id ? { id } : { all: true }) }); } catch { /* tampil lagi saat dimuat ulang */ }
  };
  return (
    <div className="kx-group" style={{ marginBottom: 12 }} role="region" aria-label="Pemberitahuan">
      {items.map(n => (
        <div key={n.id} className="kx-grow" style={{ alignItems: "flex-start" }}>
          <span className="kx-ico" aria-hidden>🔔</span>
          <span className="kx-main"><b>{n.title}</b><small style={{ lineHeight: 1.45 }}>{n.body}</small></span>
          <button type="button" className="kx-link" onClick={() => void dismiss(n.id)} aria-label={`Tandai dibaca: ${n.title}`}>OK</button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Visit ---------- */
export function VisitTab({ rows, own, invite, refresh }: { rows: VisitRow[]; own: VisitRow | undefined; invite?: string | null; refresh: () => Promise<void> }) {
  const [pick, setPick] = useState<{ date: string | null; time: string | null }>({ date: null, time: null });
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const visitInfo = useVisitInfo(own?.status === "confirmed");
  const ready = Boolean(pick.date && pick.time && c1 && c2 && c3) && !busy;
  const submit = async () => {
    if (!pick.date || !pick.time) return;
    setBusy(true); setMsg(null);
    try {
      const payload = JSON.stringify({ bookingDate: pick.date, bookingTime: pick.time, consentTerms: c1, consentAttendance: c2, consentNoShow: c3 });
      if (invite) await kolApi(`/invites/${encodeURIComponent(invite)}/booking`, { method: "POST", body: payload });
      else await kolApi("/portal/visit-calendar", { method: "POST", body: payload });
      setPick({ date: null, time: null }); setC1(false); setC2(false); setC3(false);
      setMsg({ tone: "ok", text: "Jadwal visit terkirim. Tim akan mengonfirmasi lewat WhatsApp." });
      await refresh();
    } catch (e) {
      setMsg({ tone: "err", text: errorText(e, "Jadwal belum berhasil dipesan.") });
      if ((e as any)?.code === "DATE_ALREADY_BOOKED") { setPick({ date: null, time: null }); await refresh(); }
    } finally { setBusy(false); }
  };
  return (
    <div>
      {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={`kx-note ${msg.tone === "err" ? "kx-note--err" : ""}`} style={{ marginBottom: 12 }}>{msg.text}</p>}
      {own && (
        <div className="kx-card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><b className="kx-h2">Jadwal visit-mu</b><span className={`kx-pill ${statusTone(own.status)}`}>{statusLabel(own.status)}</span></div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}><span className="kx-ico"><CalendarDays size={18} /></span><div className="kx-main"><b>{longDate(own.booking_date)}</b><small>Pukul {dotTime(own.booking_time)} WIB · review menu &amp; buat konten</small></div></div>
          <p className="kx-sub" style={{ margin: "10px 0 0", lineHeight: 1.5 }}>{own.status === "confirmed" ? "Visit-mu sudah dikonfirmasi. Untuk mengubah jadwal, hubungi admin atau manager lewat WhatsApp di bawah." : "Menunggu konfirmasi tim. Scope of Work muncul di sini setelah jadwal dikonfirmasi."}</p>
        </div>
      )}
      {own?.status === "confirmed" && (
        <div style={{ marginBottom: 14 }}>
          <VisitDetails visit={own} info={visitInfo} />
          <div className="kx-section">Scope of Work</div>
          {own.sow ? <SowCard sow={own.sow} /> : <div className="kx-card kx-sub">SOW untuk visit ini belum tersedia. Tim akan mengabari kamu.</div>}
        </div>
      )}
      {!own && <p className="kx-lead" style={{ margin: "0 0 14px" }}>Datang untuk mereview menu dan membuat kontenmu. Satu tanggal hanya untuk satu KOL. Booking mulai besok.</p>}
      <VisitPicker rows={rows} date={own ? null : pick.date} time={own ? null : pick.time} onChange={own ? () => undefined : setPick} />
      {!own && (
        <>
          <div className="kx-section">Persetujuan</div>
          <button type="button" className="kx-check" role="checkbox" aria-checked={c1} onClick={() => setC1(!c1)}><span className="kx-box" data-on={c1}>✓</span><span>Saya setuju dengan syarat &amp; ketentuan kolaborasi Djiwa Tentram.</span></button>
          <button type="button" className="kx-check" role="checkbox" aria-checked={c2} onClick={() => setC2(!c2)}><span className="kx-box" data-on={c2}>✓</span><span>Saya berkomitmen hadir sesuai jadwal. Bila berhalangan, saya akan memberi kabar lebih awal.</span></button>
          <button type="button" className="kx-check" role="checkbox" aria-checked={c3} onClick={() => setC3(!c3)}><span className="kx-box" data-on={c3}>✓</span><span>{CONSENT_NO_SHOW}</span></button>
          <button type="button" className="kx-btn" style={{ marginTop: 10 }} disabled={!ready} onClick={submit}>{busy ? "Mengirim…" : ready ? "Pesan jadwal visit" : !pick.date ? "Pilih tanggal" : !pick.time ? "Pilih jam datang" : "Setujui persetujuan"}</button>
        </>
      )}
    </div>
  );
}

/* ---------- Profil ---------- */
export function ProfileTab({ session, profile, username, refresh }: { session: SessionUser; profile: PortalProfileData | null; username: string; refresh: () => Promise<void> }) {
  const [name, setName] = useState(profile?.display_name || profile?.name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [slug, setSlug] = useState(profile?.slug || "");
  const [availability, setAvailability] = useState(profile?.public_availability || "not_set");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await kolApi("/portal/profile", { method: "PATCH", body: JSON.stringify({ displayName: name, bio, slug }) });
      await kolApi("/portal/profile/public-settings", { method: "PATCH", body: JSON.stringify({ publicAvailability: availability }) });
      await refresh(); setMsg({ tone: "ok", text: "Tersimpan." });
    } catch (e) {
      const code = (e as any)?.code;
      setMsg({ tone: "err", text: code === "SLUG_ALREADY_USED" ? "Link itu sudah dipakai creator lain." : code === "INVALID_SLUG" ? "Link minimal 2 karakter (huruf, angka, atau tanda hubung)." : code === "INVALID_DISPLAY_NAME" ? "Nama tampilan minimal 2 karakter." : "Profil belum tersimpan." });
    } finally { setBusy(false); }
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}><Avatar session={session} profile={profile} size={64} /><div style={{ minWidth: 0 }}><b className="kx-h2" style={{ display: "block" }}>{profile?.display_name || profile?.name || session.user.name}</b><span className="kx-sub">@{username}</span><div style={{ marginTop: 4 }}><span className="kx-pill kx-pill--ok">Profil publik</span></div></div></div>
      <label className="kx-label" htmlFor="kp-name">Nama tampilan</label>
      <input id="kp-name" className="kx-input" value={name} onChange={e => setName(e.target.value)} />
      <label className="kx-label" htmlFor="kp-bio">Bio</label>
      <textarea id="kp-bio" className="kx-input" maxLength={1000} value={bio} placeholder="Ceritakan gaya kontenmu…" onChange={e => setBio(e.target.value)} />
      <label className="kx-label" htmlFor="kp-slug">Link profil publik</label>
      <input id="kp-slug" className="kx-input" autoCapitalize="none" value={slug} onChange={e => setSlug(e.target.value)} />
      <label className="kx-label" htmlFor="kp-av">Ketersediaan kolaborasi</label>
      <select id="kp-av" className="kx-input" value={availability} onChange={e => setAvailability(e.target.value)}>
        <option value="not_set">Belum diatur</option><option value="open">Terbuka untuk kolaborasi</option><option value="selective">Campaign tertentu</option><option value="unavailable">Tidak tersedia</option>
      </select>
      {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={`kx-note ${msg.tone === "err" ? "kx-note--err" : ""}`} style={{ marginTop: 12 }}>{msg.text}</p>}
      <button type="button" className="kx-btn" style={{ marginTop: 14 }} disabled={busy} onClick={save}>{busy ? "Menyimpan…" : "Simpan profil"}</button>
      <div className="kx-group" style={{ marginTop: 14 }}>
        <a className="kx-grow" href={`/${username}/profile`} style={{ textDecoration: "none", color: "inherit" }}><span className="kx-ico"><Sparkles size={18} /></span><span className="kx-main"><b>Lihat profil publik</b><small>Seperti yang dilihat brand</small></span><span className="kx-chev">›</span></a>
        <button type="button" className="kx-grow" onClick={() => void logoutKol()}><span className="kx-main"><b style={{ color: "var(--kx-bad)" }}>Keluar</b></span></button>
      </div>
    </div>
  );
}
