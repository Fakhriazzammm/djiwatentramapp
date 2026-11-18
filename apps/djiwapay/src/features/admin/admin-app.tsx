import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveIdentity, type CustomerProfile } from "../../lib/identity-adapter";
import { DjiwaPayAuth } from "../auth/djiwa-pay-auth";
import { RANGES, rangeOf, useAdmin, dLong, type RangeKey } from "./admin-data";
import { FinancePage, OverviewPage, SystemPage, TrafficPage, WalletPage } from "./admin-pages";
import { UserDetailPage, UsersPage } from "./admin-users";
import "./admin.css";

const NAV: { key: string; label: string; path: string; icon: string; ranged: boolean }[] = [
  { key: "", label: "Ringkasan", path: "/admin", icon: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z", ranged: true },
  { key: "traffic", label: "Traffic", path: "/admin/traffic", icon: "M3 17l6-6 4 4 8-8M14 7h7v7", ranged: true },
  { key: "pengguna", label: "Pengguna", path: "/admin/pengguna", icon: "M16 11a4 4 0 100-8 4 4 0 000 8zM2 21a6 6 0 0112 0M17 14a5 5 0 015 5v2", ranged: false },
  { key: "keuangan", label: "Keuangan", path: "/admin/keuangan", icon: "M4 19V9m6 10V5m6 14v-7m5 7H2", ranged: true },
  { key: "dompet", label: "Dompet", path: "/admin/dompet", icon: "M3 7h15a3 3 0 013 3v7a3 3 0 01-3 3H6a3 3 0 01-3-3zm0 0l2-3h11M16 14h2", ranged: true },
  { key: "sistem", label: "Sistem & admin", path: "/admin/sistem", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12a7 7 0 00.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2L10 21h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z", ranged: false },
];
const Icon = ({ d }: { d: string }) => <svg className="adm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

function useLocation() {
  const [loc, set] = useState(() => window.location.pathname);
  useEffect(() => { const on = () => set(window.location.pathname); window.addEventListener("popstate", on); return () => window.removeEventListener("popstate", on); }, []);
  const go = useCallback((to: string) => { if (to !== window.location.pathname) window.history.pushState({}, "", to); set(to); window.scrollTo({ top: 0 }); }, []);
  return [loc.replace(/\/$/, "") || "/admin", go] as const;
}

const STORE = "djiwapay-admin-range";
function useRange() {
  const [state, set] = useState<{ key: RangeKey; from: string; to: string }>(() => { try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s?.key) return s; } catch { /* ignore */ } return { key: "this_month", ...rangeOf("this_month") }; });
  const pick = (key: RangeKey, custom?: { from: string; to: string }) => { const r = rangeOf(key, custom ?? (key === "custom" ? { from: state.from, to: state.to } : undefined)), next = { key, ...r }; set(next); try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* ignore */ } };
  // presets move with the calendar: recompute on open instead of trusting yesterday's saved dates
  useEffect(() => { if (state.key !== "custom") { const r = rangeOf(state.key); if (r.from !== state.from || r.to !== state.to) set({ key: state.key, ...r }); } }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return [state, pick] as const;
}

function RangeBar({ value, pick }: { value: { key: RangeKey; from: string; to: string }; pick: (k: RangeKey, c?: { from: string; to: string }) => void }) {
  return <div className="adm-range">
    <div className="adm-chips" role="tablist" aria-label="Rentang waktu">{RANGES.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value.key === k} className={value.key === k ? "on" : ""} onClick={() => pick(k)}>{l}</button>)}</div>
    <div className="adm-dates"><input type="date" value={value.from} max={value.to} onChange={(e) => e.target.value && pick("custom", { from: e.target.value, to: value.to })} aria-label="Dari tanggal" /><span>–</span><input type="date" value={value.to} min={value.from} onChange={(e) => e.target.value && pick("custom", { from: value.from, to: e.target.value })} aria-label="Sampai tanggal" /></div>
  </div>;
}

function Gate({ children }: { children: (me: { email: string; name: string }) => React.ReactNode }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null), [phase, setPhase] = useState<"loading" | "anon" | "ready" | "error">("loading"), [err, setErr] = useState<string | null>(null);
  useEffect(() => { resolveIdentity().then((p) => { setProfile(p); setPhase(p ? "ready" : "anon"); }, (e: Error) => { setErr(e.message); setPhase("error"); }); }, []);
  const me = useAdmin<{ admin: boolean; email: string | null }>(phase === "ready" ? "me" : null);
  if (phase === "loading") return <div className="adm adm-center"><div className="adm-loading"><i /><i /><i /></div></div>;
  if (phase === "anon" || phase === "error") return <DjiwaPayAuth error={err} />;
  if (!me.data) return <div className="adm adm-center">{me.error ? <div className="adm-err">Tidak bisa memeriksa akses ({me.error}). <button type="button" onClick={me.reload}>Coba lagi</button></div> : <div className="adm-loading"><i /><i /><i /></div>}</div>;
  if (!me.data.admin) return <div className="adm adm-center"><div className="adm-denied"><b>Akses ditolak</b><p>Akun {profile?.email ?? ""} tidak terdaftar sebagai admin Djiwa Pay.</p><a href="/">Kembali ke aplikasi</a></div></div>;
  return <>{children({ email: me.data.email ?? profile?.email ?? "", name: profile?.name ?? "Admin" })}</>;
}

export function AdminApp() {
  return <Gate>{(me) => <Shell me={me} />}</Gate>;
}

function Shell({ me }: { me: { email: string; name: string } }) {
  const [loc, go] = useLocation(), [range, pick] = useRange(), [tick, setTick] = useState(0);
  const parts = loc.split("/").filter(Boolean), section = parts[1] ?? "", sub = parts[2] ?? "";
  const nav = NAV.find((n) => n.key === section) ?? NAV[0], showRange = nav.ranged && !(section === "pengguna");
  useEffect(() => { document.title = `${nav.label} · Admin Djiwa Pay`; }, [nav.label]);
  useEffect(() => { document.documentElement.classList.add("adm-root"); return () => document.documentElement.classList.remove("adm-root"); }, []);
  const r = useMemo(() => ({ from: range.from, to: range.to }), [range.from, range.to]);
  const openUser = (id: string) => go(`/admin/pengguna/${encodeURIComponent(id)}`);
  const page = (() => {
    switch (section) {
      case "traffic": return <TrafficPage key={tick} range={r} />;
      case "pengguna": return sub ? <UserDetailPage key={sub} id={decodeURIComponent(sub)} back={() => go("/admin/pengguna")} /> : <UsersPage open={openUser} />;
      case "keuangan": return <FinancePage key={tick} range={r} openUser={openUser} />;
      case "dompet": return <WalletPage key={tick} range={r} openUser={openUser} />;
      case "sistem": return <SystemPage me={me.email} />;
      default: return <OverviewPage key={tick} range={r} go={go} />;
    }
  })();
  return <div className="adm">
    <aside className="adm-side"><a className="adm-brand" href="/admin" onClick={(e) => { e.preventDefault(); go("/admin"); }}><b>D</b><span>Djiwa Pay<small>ADMIN</small></span></a>
      <nav aria-label="Menu admin">{NAV.map((n) => <a key={n.key} href={n.path} className={nav.key === n.key ? "on" : ""} aria-current={nav.key === n.key ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(n.path); }}><Icon d={n.icon} /><span>{n.label}</span></a>)}</nav>
      <div className="adm-me"><b>{me.name}</b><small>{me.email}</small><a href="/">Buka aplikasi →</a></div></aside>
    <main className="adm-main">
      <header className="adm-top"><div><span className="adm-crumb">ADMIN / {nav.label.toUpperCase()}{sub ? " / DETAIL" : ""}</span><h1>{sub ? "Detail pengguna" : nav.label}</h1></div>
        <div className="adm-actions">{showRange ? <span className="adm-period">{range.from === range.to ? dLong(range.from) : `${dLong(range.from)} – ${dLong(range.to)}`}</span> : null}<button type="button" className="adm-btn" onClick={() => setTick((t) => t + 1)} aria-label="Muat ulang">↻<span> Muat ulang</span></button></div></header>
      <nav className="adm-mnav" aria-label="Menu admin">{NAV.map((n) => <a key={n.key} href={n.path} className={nav.key === n.key ? "on" : ""} onClick={(e) => { e.preventDefault(); go(n.path); }}>{n.label}</a>)}</nav>
      {showRange ? <RangeBar value={range} pick={pick} /> : null}
      <div className="adm-content">{page}</div>
    </main>
  </div>;
}
