import { Loader2, MapPinOff } from "lucide-react";
import type { RunLeaderboardRow, RunOverview, RunSessionVerdict, RunSocial, RunTier, RunTrackPoint } from "@/lib/djiwa-run-client";
import { formatClock, formatPace } from "@/lib/run-track-utils";

const fmt = (value: number, digits = 1) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Math.max(0, value));
const pct = (done: number, target: number) => (target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0);
const btnPrimary = "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[18px] bg-primary px-4 text-base font-black text-primary-foreground shadow-sm active:scale-[0.99] disabled:opacity-50";
const btnOutline = "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[18px] border border-primary/20 bg-card px-4 text-base font-black text-primary active:scale-[0.99]";
const card = "rounded-[22px] bg-card p-4 shadow-[0_1px_2px_rgba(16,32,63,0.06)]";

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
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">Target bulan ini</p>
        <h2 id="run-hero-title" className="mt-1.5 text-[26px] font-black leading-tight">{headline}</h2>
        <div className="relative mx-auto mt-4 h-[168px] w-[168px]" role="img" aria-label={hasTarget ? `Progres ${percent} persen, ${fmt(done)} dari ${fmt(target)} kilometer` : "Belum ada target"}>
          <svg viewBox="0 0 168 168" className="-rotate-90"><circle cx="84" cy="84" r={radius} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="18" /><circle cx="84" cy="84" r={radius} fill="none" stroke="#e8c050" strokeWidth="18" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - percent / 100)} style={{ transition: "stroke-dashoffset 600ms ease" }} /></svg>
          <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-4xl font-black tabular-nums leading-none">{fmt(done)}</p><p className="mt-1 text-sm text-white/70">{hasTarget ? `/ ${fmt(target, 0)} km` : "km bulan ini"}</p></div></div>
        </div>
        <p className="mt-3 text-center text-sm text-white/75">{next?.rewardName ? `Reward ${next.rewardName}` : "Reward saldo Djiwa Pay"}</p>
      </section>
      <button type="button" className={btnPrimary} disabled={!canStart || starting} onClick={() => onStart("running")}>{starting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}Mulai Lari</button>
      <button type="button" className={btnOutline} onClick={onManual}>Catat manual dengan bukti</button>
      {!canStart ? <p className="text-center text-xs text-muted-foreground">Campaign belum aktif, tracking GPS tersedia saat campaign dibuka.</p> : <button type="button" onClick={() => onStart("walking")} disabled={starting} className="mx-auto block min-h-10 text-xs font-bold text-muted-foreground underline">Jalan santai? Mulai sebagai jalan</button>}
      {error ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-950" role="alert">{error}</p> : null}
      <div className="grid grid-cols-3 gap-2.5">
        {[["Streak", `${streak} hari`], ["Sprint", `${pct(overview.weeklyDistanceKm, overview.weeklyTargetKm)}%`], ["Tier", tierName]].map(([label, value]) => <div key={label} className="rounded-[18px] bg-card px-3.5 py-3 shadow-[0_1px_2px_rgba(16,32,63,0.06)]"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-lg font-black">{value}</p></div>)}
      </div>
      <button type="button" onClick={onRanking} className="flex min-h-12 w-full items-center justify-between rounded-[18px] bg-card px-4 text-sm font-black shadow-[0_1px_2px_rgba(16,32,63,0.06)]">Peringkat & reward<span className="text-primary" aria-hidden="true">›</span></button>
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
          {[[distanceKm.toFixed(2).replace(".", ","), "km"], [formatPace(paceSecondsPerKm), "/km"], [formatClock(elapsedSeconds), "waktu"]].map(([v, l]) => <div key={l}><p className="text-2xl font-black tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">{phase === "paused" ? "Dijeda" : `GPS aktif · ${quality}`}</p>
      {targetKm > 0 ? <section className={card}><div className="flex items-center justify-between"><p className="text-base font-black">Target {fmt(targetKm, 0)} km</p><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-black text-primary">{percent}%</span></div><div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-sm text-muted-foreground">Validasi server berjalan otomatis</p></section> : <section className={card}><p className="text-sm text-muted-foreground">Validasi server berjalan otomatis</p></section>}
      {message ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-950" role="alert">{message}</p> : null}
      {phase === "error" ? <button type="button" onClick={onRetry} className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[18px] bg-red-700 px-4 text-base font-black text-white">Kirim ulang hasil</button>
        : <button type="button" onClick={onFinish} disabled={phase === "finishing"} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[18px] bg-red-700 px-4 text-base font-black text-white disabled:opacity-60">{phase === "finishing" ? <Loader2 className="h-5 w-5 animate-spin" /> : null}Selesai</button>}
      <button type="button" className={btnOutline} disabled={phase === "finishing"} onClick={phase === "paused" ? onResume : onPause}>{phase === "paused" ? "Lanjutkan" : "Jeda"}</button>
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
      <section className={`${card} text-center`}><span className={`inline-block rounded-full px-3.5 py-1 text-sm font-black ${chip[1]}`}>{chip[0]}</span>
        <p className="mt-3 text-[44px] font-black leading-none tabular-nums">{km.toFixed(2).replace(".", ",")} km</p>
        <p className="mt-2.5 text-sm text-muted-foreground">{formatClock(verdict.stats.duration_seconds)} · {formatPace(verdict.stats.pace_seconds_per_km)}/km · ≈{kcal} kkal</p>
        {verdict.reason ? <p className="mt-2 text-xs text-muted-foreground">{verdict.reason}</p> : null}</section>
      {ok || review ? <section className={card}><h2 className="text-base font-black">Reward diperoleh</h2><ul className="mt-2 divide-y divide-border/60">
        {ok ? <li className="flex items-center gap-3 py-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#e8c050] bg-[#fff6dc] text-sm font-black text-[#a57800]">+1</span><div><p className="font-black">Streak {streak} hari</p><p className="text-sm text-muted-foreground">Lari lagi besok untuk menjaganya</p></div></li> : null}
        {credited > 0 ? <li className="flex items-center gap-3 py-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#e8c050] bg-[#fff6dc] text-sm font-black text-[#a57800]">Rp</span><div><p className="font-black">Rp{credited.toLocaleString("id-ID")} saldo</p><p className="text-sm text-muted-foreground">Sudah masuk saldo Djiwa Pay</p></div></li> : null}
        {review ? <li className="flex items-center gap-3 py-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#e8c050] bg-[#fff6dc] text-sm font-black text-[#a57800]">Rp</span><div><p className="font-black">Reward menunggu</p><p className="text-sm text-muted-foreground">Masuk setelah ditinjau admin</p></div></li> : null}
      </ul></section> : null}
      <section className={card}><h2 className="text-base font-black">Bukti</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Rute GPS tersimpan dan divalidasi server.</p></section>
      {ok ? <button type="button" className={btnPrimary} onClick={onShare}>Bagikan ke Komunitas</button> : null}
      <button type="button" className={btnOutline} onClick={onAgain}>{ok ? "Selesai" : "Kembali"}</button>
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
  const chip = (active: boolean) => `min-h-10 rounded-full px-4 text-sm font-black ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`;
  const rows: RunLeaderboardRow[] = social?.leaderboard ?? [];
  return (
    <div className="space-y-3">
      <section className={card}>
        <div className="flex flex-wrap gap-2" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "people" && scope === "week"} className={chip(tab === "people" && scope === "week")} onClick={() => { setTab("people"); setScope("week"); }}>Minggu</button>
          <button type="button" role="tab" aria-selected={tab === "people" && scope === "month"} className={chip(tab === "people" && scope === "month")} onClick={() => { setTab("people"); setScope("month"); }}>Bulan</button>
          <button type="button" role="tab" aria-selected={tab === "teams"} className={chip(tab === "teams")} onClick={() => setTab("teams")}>Tim</button>
        </div>
        {loading ? <div className="mt-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : null}
        {error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-950" role="alert">{error}</p> : null}
        {!loading && tab === "people" ? (rows.length ? <ol className="mt-3">{rows.map((r) => <li key={`${r.rank}-${r.name}`} className={`flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0 ${r.isMe ? "-mx-2 rounded-2xl bg-primary/10 px-2" : ""}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">{r.rank}</span><span className="min-w-0 flex-1 truncate text-base font-black">{r.name}{r.isMe ? " (kamu)" : ""}</span><span className="tabular-nums text-base">{fmt(r.distanceKm)} km</span></li>)}</ol> : <p className="mt-3 rounded-2xl bg-muted/40 px-3 py-3 text-sm text-muted-foreground">Belum ada aktivitas yang lolos validasi. Jadilah yang pertama!</p>) : null}
        {!loading && tab === "teams" ? <div className="mt-3 space-y-2">{social?.teams.length ? social.teams.map((t) => <div key={t.team_id} className="flex items-center gap-3 rounded-2xl bg-muted/40 px-3 py-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-sm font-black">{t.rank}</span><div className="min-w-0 flex-1"><p className="truncate font-black">{t.team_name}</p><p className="text-xs text-muted-foreground">{t.members} anggota · {fmt(Number(t.distance_km))} km</p></div>{social.myTeamId === t.team_id ? <button type="button" disabled={busy} onClick={() => onTeam("leave_team")} className="min-h-10 rounded-full border border-border px-3 text-xs font-black">Keluar</button> : <button type="button" disabled={busy} onClick={() => onTeam("join_team", t.team_id)} className="min-h-10 rounded-full bg-primary px-3 text-xs font-black text-primary-foreground">Gabung</button>}</div>) : <p className="rounded-2xl bg-muted/40 px-3 py-3 text-sm text-muted-foreground">Belum ada tim. Buat tim pertama dan ajak teman.</p>}
          {!social?.myTeamId ? <div className="flex gap-2"><label className="sr-only" htmlFor="run-team-name">Nama tim</label><input id="run-team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={40} placeholder="Nama tim baru" className="min-h-11 flex-1 rounded-2xl border border-border bg-background px-3 text-sm" /><button type="button" disabled={busy || teamName.trim().length < 2} onClick={() => onTeam("create_team")} className="min-h-11 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50">Buat</button></div> : null}</div> : null}
      </section>
      <section className={card}><h2 className="text-base font-black">Milestone berikutnya</h2>
        {next ? <div className="mt-3 flex items-center gap-3"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-[#e8c050] bg-[#fff6dc] text-xs font-black text-[#a57800]">{fmt(next.targetKm, 0)}K</span><div className="min-w-0 flex-1"><p className="font-black">{next.name}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct(next.distanceKm, next.targetKm)}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">{fmt(next.distanceKm)} / {fmt(next.targetKm)} km{next.rewardName ? ` · ${next.rewardName}` : ""}</p></div></div> : <p className="mt-2 text-sm text-muted-foreground">Tier dan reward akan muncul saat campaign aktif.</p>}</section>
      <section className={card}><h2 className="text-base font-black">Tantangan tim</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{topTeam ? `${topTeam.team_name} memimpin dengan ${fmt(Number(topTeam.distance_km))} km — gabung dan kumpulkan km bersama.` : "Buat tim dan kumpulkan kilometer bersama teman."}</p>{tab !== "teams" ? <button type="button" onClick={() => setTab("teams")} className="mt-2 min-h-10 text-sm font-black text-primary">Lihat tim ›</button> : null}</section>
    </div>
  );
}

export function NoGpsNotice({ message, onManual }: { message: string | null; onManual: () => void }) {
  return <div className="rounded-[22px] bg-amber-50 p-4 text-sm leading-relaxed text-amber-950" role="alert"><div className="flex items-center gap-2 font-black"><MapPinOff className="h-5 w-5" />GPS tidak tersedia</div><p className="mt-1">{message ?? "Perangkat atau browser tidak mendukung lokasi."} Kamu tetap bisa mencatat lari dengan screenshot dari aplikasi olahraga.</p><button type="button" onClick={onManual} className="mt-2 min-h-11 font-black underline">Catat manual</button></div>;
}

