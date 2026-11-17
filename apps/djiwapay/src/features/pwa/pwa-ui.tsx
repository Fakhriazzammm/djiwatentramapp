import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, Sheet, spring } from "../shell/dpx-ui";
import { GUIDE, applyUpdate, currentPlatform, disablePush, enablePush, getPushState, isIos, promptInstall, sendTestPush, usePwaState, type Platform, type PushState, type StepIcon } from "../../lib/pwa";
import { enqueueIsland, islandFromPush, islandNavigate } from "../../lib/island";
import { initSound, playSound, setSoundEnabled, soundEnabled } from "../../lib/sound";

const STEP_SVG: Record<StepIcon, ReactNode> = {
  share: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  menu: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="19" r="1.8" fill="currentColor" /></svg>,
  plus: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  install: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5M9.5 10l2.5 2.5L14.5 10M8 20h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  home: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>,
  bell: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  safari: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor" /></svg>,
};
const PLATFORM_TABS: [Platform, string][] = [["ios-safari", "iPhone"], ["android-chrome", "Android"], ["desktop-chromium", "Komputer"]];
const tabOf = (p: Platform): Platform => (p.startsWith("ios") ? "ios-safari" : p.startsWith("android") ? "android-chrome" : "desktop-chromium");
const SNOOZE = "djiwa-pwa-snooze", VISITS = "djiwa-pwa-visits";
const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** Step-by-step: how to put Djiwa Pay on the home screen, for the person's own phone first. */
export function InstallGuide({ onClose, onInstall }: { onClose: () => void; onInstall?: () => void }) {
  const mine = currentPlatform(), [tab, setTab] = useState<Platform>(mine);
  const g = GUIDE[tab], [copied, setCopied] = useState(false);
  const state = usePwaState();
  return <Sheet title="Pasang Djiwa Pay" onClose={onClose}>
    <div className="dpx-pw-tabs" role="tablist" aria-label="Perangkat">{PLATFORM_TABS.map(([p, l]) => <Btn key={p} type="button" role="tab" aria-selected={tabOf(tab) === p} className={tabOf(tab) === p ? "on" : ""} onClick={() => setTab(p)}>{l}{tabOf(mine) === p ? " · perangkatmu" : ""}</Btn>)}</div>
    <h3 className="dpx-pw-h">{g.title}</h3>
    <ol className="dpx-pw-steps">{g.steps.map((s, i) => <motion.li key={`${tab}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.06 }}><span className="dpx-pw-n">{i + 1}</span><span className="dpx-pw-t">{s.text}</span>{s.icon ? <span className="dpx-pw-i">{STEP_SVG[s.icon]}</span> : null}</motion.li>)}</ol>
    {g.note ? <p className="dpx-sub dpx-pw-note">{g.note}</p> : null}
    {tab === "ios-other" ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { void navigator.clipboard?.writeText("https://djiwapay.web.id").then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }); }}>{copied ? "Tautan disalin" : "Salin tautan djiwapay.web.id"}</Btn> : null}
    {state.canPrompt && onInstall ? <Btn type="button" className="dpx-btn" onClick={onInstall}>Pasang sekarang</Btn> : null}
    <p className="dpx-sub dpx-pw-note">Setelah terpasang, Djiwa Pay terbuka layar penuh, lebih cepat, dan pemasukan serta pengeluaran bisa muncul sebagai notifikasi.</p>
  </Sheet>;
}

/** Everything about the installed app in one place: install, update, and notifications on this device. */
export function PwaSheet({ onClose, notify }: { onClose: () => void; notify: (t: string) => void }) {
  const st = usePwaState(), [push, setPush] = useState<PushState | null>(null), [busy, setBusy] = useState(false), [guide, setGuide] = useState(false), [sound, setSound] = useState(soundEnabled());
  const refresh = () => getPushState().then(setPush);
  useEffect(() => { void refresh(); }, []);
  if (guide) return <InstallGuide onClose={() => setGuide(false)} onInstall={async () => { await promptInstall(); setGuide(false); }} />;
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); await refresh(); } };
  const turnOn = () => run(async () => {
    const r = await enablePush();
    notify(r.ok ? "Notifikasi aktif di perangkat ini" : r.reason === "denied" ? "Izin notifikasi ditolak. Aktifkan lewat pengaturan browser atau ponsel." : r.reason === "need-install" ? "Pasang Djiwa Pay ke layar utama dulu, lalu buka dari ikonnya." : r.reason === "unsupported" ? "Perangkat ini belum mendukung notifikasi." : "Notifikasi belum bisa diaktifkan. Coba lagi.");
  });
  return <Sheet title="Aplikasi & notifikasi" onClose={onClose}>
    <div className="dpx-group dpx-white dpx-pw-card"><div className="dpx-pw-row"><span className="dpx-cat dpx-c-blue"><Ic n="phone" /></span><div><b>{st.installed ? "Terpasang di perangkat ini" : "Belum terpasang"}</b><span className="dpx-sub">{st.installed ? "Kamu membuka Djiwa Pay sebagai aplikasi." : "Pasang agar terbuka layar penuh dan bisa mengirim notifikasi."}</span></div></div>
      {st.installed ? null : <div className="dpx-pw-btns">{st.canPrompt ? <Btn type="button" className="dpx-btn" onClick={() => void promptInstall()}>Pasang sekarang</Btn> : null}<Btn type="button" className={`dpx-btn ${st.canPrompt ? "dpx-soft" : ""}`} onClick={() => setGuide(true)}>Lihat caranya</Btn></div>}
      {st.updateReady ? <Btn type="button" className="dpx-btn dpx-soft" onClick={applyUpdate}>Perbarui ke versi terbaru</Btn> : null}</div>
    <div className="dpx-group dpx-white dpx-pw-card"><div className="dpx-pw-row"><span className="dpx-cat dpx-c-amber"><Ic n="bell" /></span><div><b>Notifikasi push</b><span className="dpx-sub">{!push ? "Memeriksa…" : !push.supported ? "Browser ini belum mendukung." : push.needsInstall ? "Di iPhone, pasang dulu ke layar utama." : push.permission === "denied" ? "Diblokir. Izinkan lewat pengaturan browser." : push.subscribed ? "Aktif. Pemasukan, pengeluaran, dan email baru masuk sebagai notifikasi." : "Mati."}</span></div></div>
      {push?.supported && !push.needsInstall && push.permission !== "denied" ? (push.subscribed
        ? <div className="dpx-pw-btns"><Btn type="button" className="dpx-btn" disabled={busy} onClick={() => void run(async () => { notify((await sendTestPush()) ? "Notifikasi uji dikirim" : "Belum bisa mengirim notifikasi uji"); })}>Kirim notifikasi uji</Btn><Btn type="button" className="dpx-btn dpx-soft" disabled={busy} onClick={() => void run(async () => { await disablePush(); notify("Notifikasi dimatikan"); })}>Matikan</Btn></div>
        : <Btn type="button" className="dpx-btn" disabled={busy} onClick={() => void turnOn()}>Aktifkan notifikasi</Btn>) : null}
      {push?.needsInstall ? <Btn type="button" className="dpx-btn dpx-soft" onClick={() => setGuide(true)}>Cara memasang di iPhone</Btn> : null}
      <Btn type="button" className="dpx-opt" onClick={() => { const next = !sound; setSound(next); setSoundEnabled(next); if (next) playSound("in", { force: true }); }} aria-pressed={sound}><span className="dpx-main"><b>Suara notifikasi</b><span>{sound ? "Aktif: denting koin Djiwa di dalam aplikasi" : "Mati"}</span></span><span className="dpx-radio" style={sound ? { borderColor: "var(--blue)", background: "var(--blue)" } : undefined} /></Btn>
      {sound ? <div className="dpx-as-chips">{([["in", "Pemasukan"], ["out", "Pengeluaran"], ["move", "Pindah dana"], ["warn", "Pengingat"]] as const).map(([k, l]) => <Btn key={k} type="button" className="dpx-chip3" onClick={() => playSound(k, { force: true })}>▶ {l}</Btn>)}</div> : null}
      <p className="dpx-sub" style={{ margin: 0 }}>Saat aplikasi terbuka, notifikasi tampil sebagai banner island di atas layar. Saat tertutup, muncul sebagai notifikasi ponsel.</p></div>
  </Sheet>;
}

/** Install invitation, update notice, and the bridge that turns pushes into island banners. Mounted once. */
export function PwaHost() {
  const st = usePwaState(), [ask, setAsk] = useState(false), [guide, setGuide] = useState(false);
  useEffect(() => { initSound(); }, []);
  useEffect(() => {   // count visits; invite on the second one, after a calm moment
    const n = Number(read(VISITS) || 0) + 1; write(VISITS, String(n));
    if (st.installed || n < 2) return;
    const until = Number(read(SNOOZE) || 0); if (until === -1 || until > Date.now()) return;
    const t = window.setTimeout(() => setAsk(true), 14000); return () => window.clearTimeout(t);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // pushes while the app is open, taps on a notification, and a cold start from one
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; item?: Record<string, unknown>; route?: string } | undefined;
      if (!d?.type) return;
      const item = islandFromPush((d.item ?? {}) as never);
      if (d.type === "djiwa-island" && item) enqueueIsland(item);
      if (d.type === "djiwa-open") { if (item) enqueueIsland(item); if (d.route) islandNavigate(d.route); }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    const p = new URLSearchParams(window.location.search).get("p");
    if (p) {
      try { const json = JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, "+").replace(/_/g, "/"))))); const item = islandFromPush(json); if (item) window.setTimeout(() => enqueueIsland(item), 1800); } catch { /* ignore a broken link */ }
      const u = new URL(window.location.href); u.searchParams.delete("p"); window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    }
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, []);
  const snooze = (days: number) => { write(SNOOZE, String(days < 0 ? -1 : Date.now() + days * 864e5)); setAsk(false); };
  const install = async () => { if (st.canPrompt) { const r = await promptInstall(); if (r !== "unavailable") { setAsk(false); return; } } setGuide(true); };
  const visible = ask && !st.installed;
  return <>
    <AnimatePresence>{visible ? <motion.div key="inv" className="dpx dpx-pw-invite" role="dialog" aria-label="Pasang Djiwa Pay" initial={{ y: 140, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 140, opacity: 0 }} transition={spring}>
      <img src="/pwa-192.png" alt="" width={52} height={52} />
      <div className="dpx-pw-copy"><b>Pasang Djiwa Pay di ponselmu</b><span>Buka dari layar utama, layar penuh, dan terima notifikasi pemasukan atau pengeluaran.</span></div>
      <div className="dpx-pw-acts"><Btn type="button" className="dpx-pw-go" onClick={() => void install()}>{st.canPrompt ? "Pasang" : isIos() ? "Lihat caranya" : "Cara pasang"}</Btn><Btn type="button" className="dpx-pw-later" onClick={() => snooze(3)}>Nanti</Btn></div>
      <Btn type="button" className="dpx-pw-never" onClick={() => snooze(-1)}>Jangan ingatkan lagi</Btn>
    </motion.div> : null}</AnimatePresence>
    <AnimatePresence>{st.updateReady ? <motion.div key="upd" className="dpx dpx-pw-update" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring}><span>Versi baru Djiwa Pay siap</span><Btn type="button" onClick={applyUpdate}>Perbarui</Btn></motion.div> : null}</AnimatePresence>
    {guide ? <InstallGuide onClose={() => { setGuide(false); setAsk(false); }} onInstall={async () => { await promptInstall(); setGuide(false); setAsk(false); }} /> : null}
  </>;
}
