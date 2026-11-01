import { useEffect, useState } from "react";
import { Flame, Loader2, Trophy, Users } from "lucide-react";
import { getRunSocial, runTeamAction, type RunSocial } from "@/lib/djiwa-run-client";

type Props = { customerSourceId: string; customerEmail: string | null; campaignId: string | null; refreshKey: number };

export function RunSocialPanel({ customerSourceId, customerEmail, campaignId, refreshKey }: Props) {
  const [scope, setScope] = useState<"week" | "month">("week");
  const [tab, setTab] = useState<"people" | "teams">("people");
  const [data, setData] = useState<RunSocial | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);
  const identity = { customerSourceId, customerEmail };

  const load = async () => {
    if (!campaignId) return;
    setLoading(true); setError(null);
    try { setData(await getRunSocial({ ...identity, campaignId, scope })); }
    catch { setError("Peringkat belum dapat dimuat."); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [campaignId, scope, refreshKey]);

  const team = async (action: "create_team" | "join_team" | "leave_team", teamId?: string) => {
    if (!campaignId) return;
    setBusy(true); setError(null);
    try { await runTeamAction({ ...identity, campaignId, action, name: teamName.trim() || undefined, teamId }); setTeamName(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Aksi tim gagal."); }
    finally { setBusy(false); }
  };

  if (!campaignId) return null;
  return (
    <section className="rounded-[26px] border border-border bg-card p-4 shadow-sm" aria-labelledby="run-social-title">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /><h2 id="run-social-title" className="text-sm font-black">Peringkat</h2></div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800"><Flame className="h-3.5 w-3.5" />{data?.streak ?? 0} hari beruntun</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist">
        {([["people", "Pelari"], ["teams", "Tim"]] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => setTab(key)} className={`min-h-10 rounded-full px-3 text-xs font-black ${tab === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{label}</button>)}
        {tab === "people" ? (["week", "month"] as const).map((s) => <button key={s} type="button" onClick={() => setScope(s)} className={`ml-auto min-h-10 rounded-full px-3 text-xs font-bold first:ml-auto ${scope === s ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>{s === "week" ? "Minggu ini" : "Bulan ini"}</button>) : null}
      </div>
      {loading ? <div className="mt-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : null}
      {error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-950" role="alert">{error}</p> : null}

      {!loading && tab === "people" ? (data?.leaderboard.length ? <ol className="mt-3">{data.leaderboard.map((row) => <li key={`${row.rank}-${row.name}`} className={`flex items-center gap-3 border-b border-border/60 py-2 last:border-0 ${row.isMe ? "-mx-2 rounded-xl bg-primary/5 px-2" : ""}`}><span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs font-black">{row.rank}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{row.name}{row.isMe ? " (kamu)" : ""}</span><span className="text-xs font-black tabular-nums">{row.distanceKm.toLocaleString("id-ID")} km</span></li>)}</ol> : <p className="mt-3 rounded-2xl bg-muted/40 px-3 py-3 text-xs text-muted-foreground">Belum ada aktivitas yang lolos validasi periode ini. Jadilah yang pertama!</p>) : null}

      {!loading && tab === "teams" ? <div className="mt-3 space-y-2">
        {data?.teams.length ? data.teams.map((t) => <div key={t.team_id} className="flex items-center gap-3 rounded-2xl bg-muted/40 px-3 py-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-card text-xs font-black">{t.rank}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{t.team_name}</p><p className="text-[11px] text-muted-foreground">{t.members} anggota · {Number(t.distance_km).toLocaleString("id-ID")} km</p></div>{data.myTeamId === t.team_id ? <button type="button" disabled={busy} onClick={() => team("leave_team")} className="min-h-10 rounded-full border border-border px-3 text-[11px] font-black">Keluar</button> : <button type="button" disabled={busy} onClick={() => team("join_team", t.team_id)} className="min-h-10 rounded-full bg-primary px-3 text-[11px] font-black text-primary-foreground">Gabung</button>}</div>) : <p className="rounded-2xl bg-muted/40 px-3 py-3 text-xs text-muted-foreground">Belum ada tim. Buat tim pertama dan ajak teman.</p>}
        {!data?.myTeamId ? <div className="flex gap-2"><label className="sr-only" htmlFor="run-team-name">Nama tim</label><input id="run-team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={40} placeholder="Nama tim baru" className="min-h-11 flex-1 rounded-2xl border border-border bg-background px-3 text-sm" /><button type="button" disabled={busy || teamName.trim().length < 2} onClick={() => team("create_team")} className="inline-flex min-h-11 items-center gap-1 rounded-2xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-50"><Users className="h-4 w-4" />Buat</button></div> : null}
      </div> : null}
    </section>
  );
}
