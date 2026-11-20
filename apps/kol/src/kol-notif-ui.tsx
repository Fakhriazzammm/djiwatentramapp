import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { clock, dayGroup, fullDate, KIND_LABEL, metaOf, type NotifItem, type NotifKind, type Notifs } from "./kol-notifs";

const ICON: Record<NotifKind, string> = { admin: "/assets/3d/promo-voucher.png", kampanye: "/assets/3d/order-receipt.png", reward: "/assets/3d/payment-wallet.png", visit: "/assets/3d/shift-closing.png" };
const FILTERS: Array<["all" | NotifKind, string]> = [["all", "Semua"], ["admin", "Admin"], ["kampanye", "Kampanye"], ["reward", "Reward"], ["visit", "Visit"]];
const go = (path: string) => { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); };
const spring = { type: "spring", stiffness: 420, damping: 32 } as const;

/** Halaman Notifikasi: filter kategori, kelompok hari, tandai dibaca. */
export function NotificationCenter({ notifs }: { notifs: Notifs }) {
  const [filter, setFilter] = useState<"all" | NotifKind>("all");
  const unreadOf = (k: "all" | NotifKind) => notifs.items.filter((n) => (k === "all" || n.kind === k) && !n.read).length;
  const shown = useMemo(() => notifs.items.filter((n) => filter === "all" || n.kind === filter), [notifs.items, filter]);
  const groups = useMemo(() => {
    const out: Array<{ label: string; rows: NotifItem[] }> = [];
    for (const n of shown) { const label = dayGroup(n.createdAt); const last = out[out.length - 1]; if (last && last.label === label) last.rows.push(n); else out.push({ label, rows: [n] }); }
    return out;
  }, [shown]);
  const total = unreadOf("all");
  return (
    <div className="kh-page">
      <div className="kh-bar">
        <button type="button" className="kh-back" aria-label="Kembali ke beranda" onClick={() => go("/")}>‹</button>
        <div className="kh-bar-t"><b>Notifikasi</b><span>{total ? `${total} belum dibaca` : "Semua sudah dibaca"}</span></div>
        <motion.button type="button" className="kh-soft" whileTap={{ scale: 0.94 }} disabled={!total} onClick={notifs.markAll}>Tandai semua dibaca</motion.button>
      </div>
      <LayoutGroup id="notif-filter">
        <div className="kh-chips" role="group" aria-label="Filter notifikasi">
          {FILTERS.map(([key, label]) => {
            const count = key === "all" ? 0 : unreadOf(key);
            return (
              <motion.button key={key} type="button" className="kh-chip" aria-pressed={filter === key} whileTap={{ scale: 0.94 }} onClick={() => setFilter(key)}>
                {filter === key && <motion.i layoutId="chip-bg" className="kh-chip-bg" transition={spring} />}
                <span className="kh-chip-t">{label}{count > 0 && <em>{count}</em>}</span>
              </motion.button>
            );
          })}
        </div>
      </LayoutGroup>
      <motion.div layout className="kh-list">
        <AnimatePresence initial={false} mode="popLayout">
          {groups.map((g) => (
            <motion.section key={g.label} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring}>
              <h3 className="kh-grp">{g.label}</h3>
              {g.rows.map((n, i) => <NotifRow key={n.key} n={n} i={i} onTap={() => notifs.markRead(n)} />)}
            </motion.section>
          ))}
        </AnimatePresence>
      </motion.div>
      {!notifs.loading && shown.length === 0 && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="kh-empty">Belum ada notifikasi di kategori ini.</motion.p>}
    </div>
  );
}

function NotifRow({ n, i, onTap }: { n: NotifItem; i: number; onTap: () => void }) {
  const detail = n.source === "ann";
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 6) * 0.04 }} className={`kh-it ${n.read ? "is-read" : ""} ${n.urgent ? "is-urgent" : ""}`} whileTap={{ scale: 0.985 }}>
      <button type="button" className="kh-ib" onClick={onTap}>
        <span className="kh-ic"><img src={ICON[n.kind]} alt="" /></span>
        <span className="kh-it-b">
          <span className="kh-it-h"><b>{n.title}</b>{n.urgent && <span className="kh-tag">Penting</span>}</span>
          <span className="kh-it-p">{n.body}</span>
          <span className="kh-it-m">{metaOf(n)}</span>
        </span>
        <AnimatePresence>{!n.read && <motion.span className="kh-dot" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring} />}</AnimatePresence>
      </button>
      {detail && <a className="kh-more" href={`/notifikasi/${n.id}`} onClick={(e) => { e.preventDefault(); onTap(); go(`/notifikasi/${n.id}`); }}><span>Baca selengkapnya</span><span aria-hidden>›</span></a>}
    </motion.div>
  );
}

/** Detail pengumuman admin + tombol "Saya sudah baca" bila admin memintanya. */
export function AnnouncementDetail({ id, notifs }: { id: number; notifs: Notifs }) {
  const item = notifs.items.find((n) => n.source === "ann" && n.id === id);
  const [busy, setBusy] = useState(false);
  if (!item) return (
    <div className="kh-page"><div className="kh-bar"><button type="button" className="kh-back" aria-label="Kembali" onClick={() => go("/notifikasi")}>‹</button><div className="kh-bar-t"><b>Pengumuman</b></div></div>
      <p className="kh-empty">{notifs.loading ? "Memuat pengumuman…" : "Pengumuman tidak ditemukan atau bukan untukmu."}</p></div>
  );
  if (!item.read) notifs.markRead(item);
  const ack = async () => { if (item.acked || busy) return; setBusy(true); await notifs.ack(item); setBusy(false); };
  return (
    <div className="kh-page">
      <div className="kh-bar"><button type="button" className="kh-back" aria-label="Kembali ke notifikasi" onClick={() => go("/notifikasi")}>‹</button><div className="kh-bar-t"><b>Pengumuman admin</b></div></div>
      <motion.section className={`kh-hero ${item.urgent ? "" : "is-info"}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <motion.img src={ICON.admin} alt="" animate={{ y: [0, -5, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }} />
        <span className="kh-tag kh-tag--big">{item.urgent ? "PENTING" : item.kind === "kampanye" ? "KAMPANYE" : "INFO"}</span>
        <h1>{item.title}</h1>
        <p className="kh-it-m">Admin Djiwa Tentram · {fullDate(item.createdAt)} · {clock(item.createdAt)}</p>
      </motion.section>
      <motion.div className="kh-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.08 }}>
        <p className="kh-body">{item.body}</p>
      </motion.div>
      <motion.div className="kh-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.16 }}>
        {item.requireAck && (
          <motion.button type="button" className={`kh-btn ${item.acked ? "is-ok" : ""}`} whileTap={{ scale: 0.97 }} animate={item.acked ? { scale: [1, 1.04, 1] } : undefined} disabled={busy} onClick={() => void ack()}>
            {item.acked ? "Terima kasih, sudah dicatat ✓" : "Saya sudah baca"}
          </motion.button>
        )}
        <a className="kh-btn kh-btn--ghost" href="/visit" onClick={(e) => { e.preventDefault(); go("/visit"); }}>Lihat jadwal visit saya</a>
        {item.requireAck && <p className="kh-note">{item.acked ? "Admin bisa melihat bahwa kamu sudah membaca pengumuman ini." : "Ketuk agar admin tahu kamu sudah membaca."}</p>}
      </motion.div>
    </div>
  );
}

export { KIND_LABEL };
