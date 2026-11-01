import { useEffect } from "react";
import { Loader2, MapPinOff } from "lucide-react";
import type { RunLeaderboardRow, RunOverview, RunSessionVerdict, RunSocial, RunTier, RunTrackPoint } from "@/lib/djiwa-run-client";
import { formatClock, formatPace } from "@/lib/run-track-utils";

const fmt = (value: number, digits = 1) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Math.max(0, value));
const pct = (done: number, target: number) => (target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0);
const press = "touch-manipulation select-none transition-[transform,opacity] duration-150 active:scale-[0.97] active:opacity-90 motion-reduce:transition-none motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent]";
const btnPrimary = `inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 text-[17px] font-semibold text-primary-foreground disabled:opacity-40 ${press}`;
const btnTinted = `inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-primary/10 px-4 text-[17px] font-semibold text-primary ${press}`;
const card = "rounded-[20px] bg-card p-4 shadow-[0_0_0_0.5px_rgba(60,60,67,0.12)]";
const groupRow = "flex min-h-[44px] items-center";

export function daysLeft(periodLabel: string) {
  const end = periodLabel.split("–").pop()?.trim() ?? "";
  const ms = Date.parse(end); if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil((ms + 86_400_000 - Date.now()) / 86_400_000));
}

/* ---------- 1 · Beranda ---------- */
export function RunHomeView({ overview, streak, canStart, starting, error, onStart, onManual, onRanking }: {
  overview: RunOverview; streak: number; canStart: boolean; starting: boolean; error: string | null;
  onStart: (type: "running" | "walking") => void; onManual: () => void; onRanking: () => void;
}) {
  const target = overview.monthlyTargetKm, done = overview.monthlyDistanceKm, hasTarget = target > 0;
  const remaining = Math.max(0, target - done), percent = pct(done, target);
  const radius = 64, circ = 2 * Math.PI * radius;
  const next: RunTier | null = overview.tiers.find((t) => t.status === "in_progress") ?? null;
  const headline = !hasTarget ? "Siap berlari?" : remaining === 0 ? "Target tercapai!" : `Tinggal ${fmt(remaining)} km lagi`;
  const tierName = overview.tiers.filter((t) => t.status !== "in_progress").slice(-1)[0]?.name ?? next?.name ?? "–";
  return (
    <div className="space-y-3">
      <section className="rounded-[24px] bg-gradient-to-b from-[#1b2d52] to-[#0f1b36] px-5 pb-5 pt-5 text-white shadow-[0_12px_30px_rgba(13,27,54,0.22)]" aria-labelledby="run-hero-title">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Target bulan ini</p>
        <h2 id="run-hero-title" className="mt-1.5 text-[26px] font-bold leading-tight">{headline}</h2>
        <div className="relative mx-auto mt-4 h-[168px] w-[168px]" role="img" aria-label={hasTarget ? `Progres ${percent} persen, ${fmt(done)} dari ${fmt(target)} kilometer` : "Belum ada target"}>
          <svg viewBox="0 0 168 168" className="-rotate-90"><circle cx="84" cy="84" r={radius} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="18" /><circle cx="84" cy="84" r={radius} fill="none" stroke="#e8c050" strokeWidth="18" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - percent / 100)} className="motion-reduce:[transition:none]" style={{ transition: "stroke-dashoffset 600ms ease" }} /></svg>
          <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-4xl font-bold tabular-nums leading-none">{fmt(done)}</p><p className="mt-1 text-sm text-white/70">{hasTarget ? `/ ${fmt(target, 0)} km` : "km bulan ini"}</p></div></div>
        </div>
        <p className="mt-3 text-center text-sm text-white/75">{next?.rewardName ? `Reward ${next.rewardName}` : "Reward saldo Djiwa Pay"}</p>
      </section>
      <button type="button" className={btnPrimary} disabled={!canStart || starting} onClick={() => onStart("running")}>{starting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}Mulai Lari</button>
      <button type="button" className={btnTinted} onClick={onManual}>Catat manual dengan bukti</button>
      {!canStart ? <p className="text-center text-xs text-muted-foreground">Campaign belum aktif, tracking GPS tersedia saat campaign dibuka.</p> : <button type="button" onClick={() => onStart("walking")} disabled={starting} className={`mx-auto flex min-h-11 items-center text-[15px] font-medium text-primary ${press}`}>Jalan santai? Mulai sebagai jalan</button>}
      {error ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-950" role="alert">{error}</p> : null}
      <div className="grid grid-cols-3 gap-2.5">
        {[["Streak", `${streak} hari`], ["Sprint", `${pct(overview.weeklyDistanceKm, overview.weeklyTargetKm)}%`], ["Tier", tierName]].map(([label, value]) => <div key={label} className="rounded-[16px] bg-card px-3.5 py-3 shadow-[0_0_0_0.5px_rgba(60,60,67,0.12)]"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-lg font-semibold">{value}</p></div>)}
      </div>
      <button type="button" onClick={onRanking} className={`flex min-h-[50px] w-full items-center justify-between rounded-[16px] bg-card px-4 text-[17px] font-medium shadow-[0_0_0_0.5px_rgba(60,60,67,0.12)] ${press}`}>Peringkat & reward<span className="text-primary" aria-hidden="true">›</span></button>
    </div>
  );
}

/* ---------- 2 · Sedang berlari ---------- */
function RouteMap({ points }: { points: RunTrackPoint[] }) {
  const W = 300, H = 220, pad = 24;
  if (points.length < 2) return <div className="grid h-full place-items-center text-xs text-muted-foreground">Mencari sinyal GPS…</div>;
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const scale = Math.min((W - 2 * pad) / Math.max(1e-6, maxLng - minLng), (H - 2 * pad) / Math.max(1e-6, maxLat - minLat));
  const x = (lng: number) => pad + (lng - minLng) * scale + (W - 2 * pad - (maxLng - minLng) * scale) / 2;
  const y = (lat: number) => H - pad - (lat - minLat) * scale - (H - 2 * pad - (maxLat - minLat) * scale) / 2;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.lng).toFixed(1)} ${y(p.lat).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full text-primary" role="img" aria-label="Rute lari"><path d={d} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><circle cx={x(last.lng)} cy={y(last.lat)} r="8" fill="#e8c050" stroke="#fff" strokeWidth="3" /></svg>;
}

export function RunLiveView({ phase, points, distanceKm, paceSecondsPerKm, elapsedSeconds, accuracy, targetKm, doneKm, message, onPause, onResume, onFinish, onRetry }: {
  phase: "tracking" | "paused" | "finishing" | "error"; points: RunTrackPoint[]; distanceKm: number; paceSecondsPerKm: number | null; elapsedSeconds: number;
  accuracy: number | null; targetKm: number; doneKm: number; message: string | null; onPause: () => void; onResume: () => void; onFinish: () => void; onRetry: () => void;
}) {
  const percent = pct(doneKm + distanceKm, targetKm);
  const quality = accuracy == null ? "mencari sinyal" : accuracy <= 15 ? "akurasi baik" : accuracy <= 50 ? "akurasi cukup" : "akurasi rendah";
  return (
    <div className="space-y-3">
      <div className="relative h-[250px] overflow-hidden rounded-[24px] bg-gradient-to-br from-[#dfe9f7] to-[#eef3fb]"><RouteMap points={points} />
        <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 rounded-[18px] bg-card px-2 py-3 text-center shadow-[0_6px_18px_rgba(16,32,63,0.15)]" aria-live="off">
          {[[distanceKm.toFixed(2).replace(".", ","), "km"], [formatPace(paceSecondsPerKm), "/km"], [formatClock(elapsedSeconds), "waktu"]].map(([v, l]) => <div key={l}><p className="text-2xl font-bold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">{phase === "paused" ? "Dijeda" : `GPS aktif · ${quality}`}</p>
      {targetKm > 0 ? <section className={card}><div className="flex items-center justify-between"><p className="text-base font-semibold">Target {fmt(targetKm, 0)} km</p><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{percent}%</span></div><div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-sm text-muted-foreground">Validasi server berjalan otomatis</p></section> : <section className={card}><p className="text-sm text-muted-foreground">Validasi server berjalan otomatis</p></section>}
      <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">Biarkan layar menyala dan halaman tetap terbuka. iPhone menghentikan GPS saat layar terkunci atau pindah aplikasi.</p>
      {message ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-950" role="alert">{message}</p> : null}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md space-y-2 border-t border-black/5 bg-background/80 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        {phase === "error"
          ? <button type="button" onClick={onRetry} className={`inline-flex min-h-[50px] w-full items-center justify-center rounded-[14px] bg-red-600 px-4 text-[17px] font-semibold text-white ${press}`}>Kirim ulang hasil</button>
          : <button type="button" onClick={onFinish} disabled={phase === "finishing"} className={`inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-red-600 px-4 text-[17px] font-semibold text-white disabled:opacity-60 ${press}`}>{phase === "finishing" ? <Loader2 className="h-5 w-5 animate-spin" /> : null}Selesai</button>}
        <button type="button" className={btnTinted} disabled={phase === "finishing"} onClick={phase === "paused" ? onResume : onPause}>{phase === "paused" ? "Lanjutkan" : "Jeda"}</button>
      </div>
    </div>
  );
}

/* ---------- 3 · Hasil lari ---------- */
export function RunResultView({ verdict, activityType, streak, onShare, onAgain }: { verdict: RunSessionVerdict; activityType: "running" | "walking"; streak: number; onShare: () => void; onAgain: () => void }) {
  const ok = verdict.status === "accepted", review = verdict.status === "review";
  const km = verdict.stats.distance_km, kcal = Math.round(km * (activityType === "running" ? 62 : 45));
  const credited = verdict.rewards?.credited?.reduce((n, r) => n + r.amount, 0) ?? 0;
  const chip = ok ? ["Lolos validasi", "bg-primary/10 text-primary"] : review ? ["Menunggu tinjauan", "bg-amber-100 text-amber-800"] : ["Tidak dapat dicatat", "bg-red-100 text-red-800"];
  return (
    <div className="space-y-3">
      <section className={`${card} text-center`}><span className={`inline-block rounded-full px-3.5 py-1 text-sm font-semibold ${chip[1]}`}>{chip[0]}</span>
        <p className="mt-3 text-[44px] font-bold leading-none tabular-nums">{km.toFixed(2).replace(".", ",")} km</p>
        <p className="mt-2.5 text-sm text-muted-foreground">{formatClock(verdict.stats.duration_seconds)} · {formatPace(verdict.stats.pace_seconds_per_km)}/km · ≈{kcal} kkal</p>
        {verdict.reason ? <p className="mt-2 text-xs text-muted-foreground">{verdict.reason}</p> : null}</section>
      {ok || review ? <section className={card}><h2 className="text-base font-semibold">Reward diperoleh</h2><ul className="mt-2 divide-y divide-border/60">
        {ok ? <li className="flex items-center gap-3 py-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#e8c050] bg-[#fff6dc] text-sm font-semibold text-[#a57800]">+1</span><div><p className="font-semibold">Streak {streak} hari</p><p className="text-sm text-muted-foreground">Lari lagi besok untuk menjaganya</p></div></li> : null}
        {credited > 0 ? <li className="flex items-center gap-3 py-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#e8c050] bg-[#fff6dc] text-sm font-semibold text-[#a57800]">Rp</span><div><p className="font-semibold">Rp{credited.toLocaleString("id-ID")} saldo</p><p className="text-sm text-muted-foreground">Sudah masuk saldo Djiwa Pay</p></div></li> : null}
        {review ? <li className="flex items-center gap-3 py-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#e8c050] bg-[#fff6dc] text-sm font-semibold text-[#a57800]">Rp</span><div><p className="font-semibold">Reward menunggu</p><p className="text-sm text-muted-foreground">Masuk setelah ditinjau admin</p></div></li> : null}
      </ul></section> : null}
      <section className={card}><h2 className="text-base font-semibold">Bukti</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Rute GPS tersimpan dan divalidasi server.</p></section>
      {ok ? <button type="button" className={btnPrimary} onClick={onShare}>Bagikan ke Komunitas</button> : null}
      <button type="button" className={btnTinted} onClick={onAgain}>{ok ? "Selesai" : "Kembali"}</button>
    </div>
  );
}

/* ---------- 4 · Peringkat & reward ---------- */
export function RunRankingView({ social, loading, error, tab, setTab, scope, setScope, overview, busy, teamName, setTeamName, onTeam }: {
  social: RunSocial | null; loading: boolean; error: string | null; tab: "people" | "teams"; setTab: (t: "people" | "teams") => void;
  scope: "week" | "month"; setScope: (s: "week" | "month") => void; overview: RunOverview; busy: boolean; teamName: string; setTeamName: (v: string) => void;
  onTeam: (action: "create_team" | "join_team" | "leave_team", teamId?: string) => void;
}) {
  const next = overview.tiers.find((t) => t.status === "in_progress") ?? null;
  const topTeam = social?.teams[0] ?? null;
  const rows: RunLeaderboardRow[] = social?.leaderboard ?? [];
  return (
    <div className="space-y-3">
      <section className={card}>
        <div className="grid grid-cols-3 rounded-[10px] bg-muted p-0.5" role="tablist" aria-label="Periode peringkat">
          {([["Minggu", tab === "people" && scope === "week", () => { setTab("people"); setScope("week"); }], ["Bulan", tab === "people" && scope === "month", () => { setTab("people"); setScope("month"); }], ["Tim", tab === "teams", () => setTab("teams")]] as const).map(([label, active, onSelect]) => (
            <button key={label} type="button" role="tab" aria-selected={active} onClick={onSelect} className={`min-h-[34px] rounded-[8px] text-[15px] font-semibold transition-colors motion-reduce:transition-none ${active ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-muted-foreground"} touch-manipulation [-webkit-tap-highlight-color:transparent]`}>{label}</button>
          ))}
        </div>
        {loading ? <div className="mt-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : null}
        {error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-950" role="alert">{error}</p> : null}
        {!loading && tab === "people" ? (rows.length ? <ol className="mt-3">{rows.map((r) => <li key={`${r.rank}-${r.name}`} className={`flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0 ${r.isMe ? "-mx-2 rounded-2xl bg-primary/10 px-2" : ""}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{r.rank}</span><span className="min-w-0 flex-1 truncate text-base font-semibold">{r.name}{r.isMe ? " (kamu)" : ""}</span><span className="tabular-nums text-base">{fmt(r.distanceKm)} km</span></li>)}</ol> : <p className="mt-3 rounded-2xl bg-muted/40 px-3 py-3 text-sm text-muted-foreground">Belum ada aktivitas yang lolos validasi. Jadilah yang pertama!</p>) : null}
        {!loading && tab === "teams" ? <div className="mt-3 space-y-2">{social?.teams.length ? social.teams.map((t) => <div key={t.team_id} className="flex items-center gap-3 rounded-2xl bg-muted/40 px-3 py-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-sm font-semibold">{t.rank}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{t.team_name}</p><p className="text-xs text-muted-foreground">{t.members} anggota · {fmt(Number(t.distance_km))} km</p></div>{social.myTeamId === t.team_id ? <button type="button" disabled={busy} onClick={() => onTeam("leave_team")} className="min-h-10 rounded-full border border-border px-3 text-xs font-semibold">Keluar</button> : <button type="button" disabled={busy} onClick={() => onTeam("join_team", t.team_id)} className="min-h-10 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">Gabung</button>}</div>) : <p className="rounded-2xl bg-muted/40 px-3 py-3 text-sm text-muted-foreground">Belum ada tim. Buat tim pertama dan ajak teman.</p>}
          {!social?.myTeamId ? <div className="flex gap-2"><label className="sr-only" htmlFor="run-team-name">Nama tim</label><input id="run-team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={40} placeholder="Nama tim baru" className="min-h-11 flex-1 rounded-[12px] border border-border bg-background px-3 text-base" /><button type="button" disabled={busy || teamName.trim().length < 2} onClick={() => onTeam("create_team")} className="min-h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Buat</button></div> : null}</div> : null}
      </section>
      <section className={card}><h2 className="text-base font-semibold">Milestone berikutnya</h2>
        {next ? <div className="mt-3 flex items-center gap-3"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-[#e8c050] bg-[#fff6dc] text-xs font-semibold text-[#a57800]">{fmt(next.targetKm, 0)}K</span><div className="min-w-0 flex-1"><p className="font-semibold">{next.name}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct(next.distanceKm, next.targetKm)}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">{fmt(next.distanceKm)} / {fmt(next.targetKm)} km{next.rewardName ? ` · ${next.rewardName}` : ""}</p></div></div> : <p className="mt-2 text-sm text-muted-foreground">Tier dan reward akan muncul saat campaign aktif.</p>}</section>
      <section className={card}><h2 className="text-base font-semibold">Tantangan tim</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{topTeam ? `${topTeam.team_name} memimpin dengan ${fmt(Number(topTeam.distance_km))} km — gabung dan kumpulkan km bersama.` : "Buat tim dan kumpulkan kilometer bersama teman."}</p>{tab !== "teams" ? <button type="button" onClick={() => setTab("teams")} className="mt-2 min-h-10 text-sm font-semibold text-primary">Lihat tim ›</button> : null}</section>
    </div>
  );
}

export function NoGpsNotice({ message, onManual }: { message: string | null; onManual: () => void }) {
  return <div className="rounded-[22px] bg-amber-50 p-4 text-sm leading-relaxed text-amber-950" role="alert"><div className="flex items-center gap-2 font-semibold"><MapPinOff className="h-5 w-5" />GPS tidak tersedia</div><p className="mt-1">{message ?? "Perangkat atau browser tidak mendukung lokasi."} Kamu tetap bisa mencatat lari dengan screenshot dari aplikasi olahraga.</p><button type="button" onClick={onManual} className="mt-2 min-h-11 font-semibold underline">Catat manual</button></div>;
}


/* ---------- iOS action sheet ---------- */
export function ActionSheet({ open, title, message, destructiveLabel, cancelLabel = "Batal", onDestructive, onCancel }: { open: boolean; title: string; message?: string; destructiveLabel: string; cancelLabel?: string; onDestructive: () => void; onCancel: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <button type="button" aria-label="Tutup" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="run-sheet-title" className="relative w-full max-w-md space-y-2 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none">
        <div className="overflow-hidden rounded-[14px] bg-card/95 backdrop-blur-xl">
          <div className="px-4 py-3 text-center"><p id="run-sheet-title" className="text-[13px] font-semibold text-muted-foreground">{title}</p>{message ? <p className="mt-0.5 text-[13px] text-muted-foreground">{message}</p> : null}</div>
          <button type="button" onClick={onDestructive} className={`min-h-[57px] w-full border-t border-border/60 text-[20px] text-red-600 ${press}`}>{destructiveLabel}</button>
        </div>
        <button type="button" autoFocus onClick={onCancel} className={`min-h-[57px] w-full rounded-[14px] bg-card text-[20px] font-semibold text-primary ${press}`}>{cancelLabel}</button>
      </div>
    </div>
  );
}
