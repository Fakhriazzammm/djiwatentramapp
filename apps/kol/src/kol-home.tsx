import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { Creators, Feed } from "./kol-community";
import { dotTime, logoutKol, longDate, type VisitRow } from "./kol-lib";
import { clock } from "./kol-notifs";
import type { Notifs } from "./kol-notifs";
import { rupiah } from "./kol-rewards";
import type { PortalProfileData, PortalTabKey } from "./kol-portal-ui";

type SessionUser = { user: { id: string; name?: string | null; email?: string | null; image?: string | null } };
const SEGMENTS = ["Untuk kamu", "Linimasa", "Creator"] as const;
const spring = { type: "spring", stiffness: 420, damping: 32 } as const;
const go = (path: string) => { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); };
const R = 24, C = 2 * Math.PI * R;

/** Beranda gabungan: Untuk kamu, Linimasa komunitas, dan Creator, plus lonceng notifikasi dan banner pengumuman admin. */
export function KolHome({ session, profile, own, campaigns, onNavigate, username, notifs, initialSeg = 0 }: {
  session: SessionUser; profile: PortalProfileData | null; own: VisitRow | undefined; campaigns: any[];
  onNavigate: (t: PortalTabKey) => void; username: string; notifs: Notifs; initialSeg?: number;
}) {
  const [seg, setSeg] = useState(initialSeg);
  const reduce = useReducedMotion();
  const name = (profile?.display_name || profile?.name || session.user.name || "Creator").split(" ")[0];
  const banner = notifs.banner;
  return (
    <div className="kh-home">
      <motion.header className="kh-head" initial={reduce ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <div><span>Selamat datang,</span><h1>Halo, {name}</h1></div>
        <div className="kh-head-a">
          <a className="kh-bell" href="/notifikasi" aria-label={notifs.unread ? `Notifikasi, ${notifs.unread} belum dibaca` : "Notifikasi"} onClick={(e) => { e.preventDefault(); go("/notifikasi"); }}>
            <motion.img src="/assets/3d/notifications-alerts.png" alt="" animate={notifs.unread && !reduce ? { rotate: [0, 14, -12, 8, 0] } : { rotate: 0 }} transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 3.2 }} style={{ transformOrigin: "50% 12%" }} />
            <AnimatePresence>{notifs.unread > 0 && <motion.b key="bd" className="kh-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}>{notifs.unread > 9 ? "9+" : notifs.unread}</motion.b>}</AnimatePresence>
          </a>
          <button type="button" className="kh-out" aria-label="Keluar dari akun" onClick={() => void logoutKol()}><LogOut size={18} /></button>
        </div>
      </motion.header>

      <AnimatePresence initial={false}>
        {banner && (
          <motion.div key={banner.key} className="kh-banner" initial={{ opacity: 0, height: 0, y: -10 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -10 }} transition={spring}>
            <a href={`/notifikasi/${banner.id}`} onClick={(e) => { e.preventDefault(); go(`/notifikasi/${banner.id}`); }}>
              <img src="/assets/3d/promo-voucher.png" alt="" />
              <span><small>DARI ADMIN{banner.urgent ? " · PENTING" : ""} · {clock(banner.createdAt)}</small><b>{banner.title}</b></span>
            </a>
            <button type="button" aria-label="Tutup pengumuman" onClick={() => notifs.markRead(banner)}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <LayoutGroup id="home-seg">
        <div className="kh-seg" role="tablist" aria-label="Tampilan beranda">
          {SEGMENTS.map((label, i) => (
            <button key={label} type="button" role="tab" aria-selected={seg === i} className={seg === i ? "on" : ""} onClick={() => setSeg(i)}>
              {seg === i && <motion.i layoutId="seg-pill" className="kh-seg-pill" transition={spring} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={seg} className="kh-panel" initial={reduce ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -14 }} transition={{ duration: 0.22 }}>
          {seg === 0 && <ForYou session={session} profile={profile} own={own} campaigns={campaigns} onNavigate={onNavigate} />}
          {seg === 1 && <Feed username={username} />}
          {seg === 2 && <Creators username={username} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ForYou({ session, profile, own, campaigns, onNavigate }: { session: SessionUser; profile: PortalProfileData | null; own: VisitRow | undefined; campaigns: any[]; onNavigate: (t: PortalTabKey) => void }) {
  const tasks = useMemo(() => [
    { key: "socials", done: Boolean(profile?.platforms?.length), label: "Sosmed" },
    { key: "avatar", done: Boolean(session.user.image || profile?.avatar_url), label: "Foto" },
    { key: "bio", done: Boolean(profile?.bio?.trim()), label: "Bio" },
    { key: "slug", done: Boolean(profile?.slug?.trim()), label: "Link" },
  ], [profile, session.user.image]);
  const left = tasks.filter((t) => !t.done).length;
  const pct = Math.round(((tasks.length - left) / tasks.length) * 100);
  const nextCampaign = campaigns.find((c) => c.assignment_status === "invited") || campaigns.find((c) => c.status === "published" && !c.assignment_id && c.can_apply !== false) || campaigns.find((c) => c.status === "published");
  const visitLabel = own?.status === "confirmed" ? "Terkonfirmasi" : "Menunggu konfirmasi";
  return (
    <>
      <motion.section className="kh-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <div className="kh-ringrow">
          <div className="kh-ring">
            <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r={R} fill="none" stroke="#e4e8f1" strokeWidth="7" /><motion.circle cx="30" cy="30" r={R} fill="none" stroke="#2f7de6" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct / 100) }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }} transform="rotate(-90 30 30)" /></svg>
            <b>{pct}%</b>
          </div>
          <div><b>Profilmu {pct}% lengkap</b><span>{left === 0 ? "Siap dilirik brand dan creator lain" : `${left} langkah lagi: ketuk chip yang belum`}</span></div>
        </div>
        <div className="kh-tchips">
          {tasks.map((t) => (
            <motion.button key={t.key} type="button" className={`kh-tchip ${t.done ? "on" : ""}`} whileTap={{ scale: 0.92 }} animate={t.done ? { scale: [1, 1.08, 1] } : undefined} onClick={() => !t.done && onNavigate("profile")} aria-label={t.done ? `${t.label} selesai` : `Lengkapi ${t.label}`}>{t.done ? "✓" : "+"} {t.label}</motion.button>
          ))}
        </div>
      </motion.section>

      <motion.section className="kh-next" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.06 }}>
        <div className="kh-next-t"><div><small>LANGKAH BERIKUTNYA</small><b>{own ? "Jadwal visit-mu" : "Pilih jadwal visit"}</b>
          {own ? <p>{longDate(own.booking_date)} · {dotTime(own.booking_time)} WIB · {visitLabel}</p> : <p>Datang, buat konten, dapat reward ke saldo Djiwa Pay.</p>}</div>
          <motion.img src="/assets/3d/shift-closing.png" alt="" animate={{ y: [0, -4, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} />
        </div>
        <motion.button type="button" className="kh-white" whileTap={{ scale: 0.97 }} onClick={() => onNavigate("calendar")}>{own ? "Lihat SOW & detail visit" : "Pilih jadwal visit"}</motion.button>
      </motion.section>

      {nextCampaign ? (
        <motion.a className="kh-camp" href={`/campaigns/${nextCampaign.slug}`} onClick={(e) => { e.preventDefault(); go(`/campaigns/${nextCampaign.slug}`); }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.12 }} whileTap={{ scale: 0.98 }}>
          <span className="kh-camp-img">{nextCampaign.cover_url ? <img src={nextCampaign.cover_url} alt="" /> : <i />}{nextCampaign.reward && <em>{rupiah(nextCampaign.reward.ratePer1000)}</em>}</span>
          <span className="kh-camp-b"><span className="kh-camp-h"><b>{nextCampaign.title}</b><span className="kh-pill">{nextCampaign.assignment_status === "invited" ? "Undangan" : "Dibuka"}</span></span>
            <small>{nextCampaign.benefit_description || nextCampaign.description}{nextCampaign.reward ? ` · ${nextCampaign.reward.slotsLeft} slot tersisa` : ""}</small></span>
        </motion.a>
      ) : <div className="kh-card kh-muted">Belum ada kampanye. Kami kabari lewat notifikasi saat ada yang cocok.</div>}
    </>
  );
}
