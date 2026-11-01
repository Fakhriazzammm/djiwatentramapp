import { Flame, Gift, Target } from "lucide-react";
import type { RunOverview } from "@/lib/djiwa-run-client";

const RING = { size: 132, stroke: 12 } as const;
const fmt = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(Math.max(0, value));

type Props = { overview: RunOverview; streak?: number; onStart?: () => void };

export function RunProgressHero({ overview, streak = 0 }: Props) {
  const target = overview.monthlyTargetKm;
  const done = overview.monthlyDistanceKm;
  const hasTarget = target > 0;
  const percent = hasTarget ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const remaining = hasTarget ? Math.max(0, target - done) : 0;
  const radius = (RING.size - RING.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const next = overview.tiers.find((tier) => tier.status === "in_progress") ?? null;

  const headline = !hasTarget ? "Siap berlari?" : remaining === 0 ? "Target tercapai!" : `Tinggal ${fmt(remaining)} km lagi`;
  const body = !hasTarget
    ? "Target campaign sedang disiapkan. Kamu tetap bisa mencatat lari — jaraknya ikut terhitung begitu campaign aktif."
    : remaining === 0 ? "Hebat! Reward kamu sudah terbuka atau sedang diproses." : next?.rewardName ? `Reward berikutnya: ${next.rewardName}` : "Setiap kilometer yang lolos validasi mendekatkanmu ke reward Djiwa Pay.";

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[#0d2d54] p-5 text-white shadow-[0_12px_30px_rgba(13,45,84,0.18)]" aria-labelledby="run-progress-title">
      <img src="/djiwa-run-hero.webp" alt="" aria-hidden="true" loading="lazy" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-30" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0d2d54]/85 to-[#0d2d54]" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-100">{overview.campaignName}</p>
          <h2 id="run-progress-title" className="mt-1 text-[22px] font-black leading-tight">{headline}</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-blue-100/90">{body}</p>
        </div>
        {streak > 0 ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-black text-amber-200"><Flame className="h-3.5 w-3.5" />{streak} hari</span> : null}
      </div>

      <div className="relative z-10 mt-4 flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: RING.size, height: RING.size }} role="img" aria-label={hasTarget ? `Progres ${percent} persen, ${fmt(done)} dari ${fmt(target)} kilometer` : "Belum ada target"}>
          <svg width={RING.size} height={RING.size} className="-rotate-90">
            <circle cx={RING.size / 2} cy={RING.size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={RING.stroke} />
            <circle cx={RING.size / 2} cy={RING.size / 2} r={radius} fill="none" stroke="#f4d27a" strokeWidth={RING.stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} style={{ transition: "stroke-dashoffset 600ms ease" }} />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-3xl font-black tabular-nums leading-none">{fmt(done)}</p><p className="mt-1 text-[10px] font-bold text-blue-100">{hasTarget ? `/ ${fmt(target)} km` : "km bulan ini"}</p></div></div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2 text-[11px]">
          <li className="flex items-center gap-2"><Target className="h-4 w-4 shrink-0 text-blue-200" /><span className="min-w-0"><span className="block font-black">{hasTarget ? `${percent}% target bulan ini` : "Target belum diatur"}</span><span className="text-blue-100/80">Sprint minggu ini {fmt(overview.weeklyDistanceKm)}{overview.weeklyTargetKm > 0 ? ` / ${fmt(overview.weeklyTargetKm)}` : ""} km</span></span></li>
          <li className="flex items-center gap-2"><Gift className="h-4 w-4 shrink-0 text-amber-200" /><span className="min-w-0"><span className="block font-black">{next ? next.name : "Reward menyusul"}</span><span className="text-blue-100/80">{next ? `${fmt(next.distanceKm)} / ${fmt(next.targetKm)} km` : "Muncul saat campaign aktif"}</span></span></li>
        </ul>
      </div>
      <p className="relative z-10 mt-4 text-[10px] text-blue-100/70">Progres dihitung dari aktivitas yang lolos validasi server.</p>
    </section>
  );
}
