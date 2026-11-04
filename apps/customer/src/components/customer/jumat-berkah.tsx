import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, HeartHandshake, X } from "lucide-react";
import { useJumatBerkah } from "@/hooks/use-jumat-berkah";
import {
  FALLBACK_PRAYER, formatCountdown, orderPrayersForBanner, progressPercent, stepIndex,
  type JumatBerkahPhoto, type JumatBerkahPrayer,
} from "@/lib/jumat-berkah-logic";
import { cn } from "@/lib/utils";

const ROTATE_MS = 7000;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export function prayerMeta(prayer: Pick<JumatBerkahPrayer, "displayName" | "portions">): string {
  return `${prayer.displayName}${prayer.portions ? ` · ${prayer.portions} porsi` : ""}`;
}

/**
 * Banner beranda (desain E). Semua doa ditumpuk di satu sel grid sehingga tinggi banner mengikuti
 * doa terpanjang: teks tidak pernah terpotong dan tidak ada loncatan saat berganti.
 */
export function JumatBerkahBanner({ onOpen, onDonate }: { onOpen: () => void; onDonate: () => void }) {
  const { overview, state } = useJumatBerkah();
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const seed = useRef(Math.floor(Date.now() / 3_600_000));
  const [now, setNow] = useState(() => Date.now());

  const prayers = useMemo(() => {
    const list = overview && overview.enabled && overview.prayers.length > 0 ? overview.prayers : [FALLBACK_PRAYER];
    return orderPrayersForBanner(list, seed.current);
  }, [overview]);

  useEffect(() => { if (index >= prayers.length) setIndex(0); }, [index, prayers.length]);
  useEffect(() => {
    if (reduced || paused || prayers.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => stepIndex(value, prayers.length, 1)), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [reduced, paused, prayers.length]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (state === "loading" && !overview) {
    return <div className="h-[132px] animate-pulse rounded-[26px] bg-emerald-900/15" aria-hidden="true" />;
  }
  if (!overview || !overview.enabled) return null;

  const { campaign } = overview;
  const percent = progressPercent(campaign.paidPortions, campaign.targetPortions);
  const closed = campaign.remainingPortions <= 0 || Date.parse(campaign.closesAt) <= now;

  return (
    <section
      aria-label="Jumat Berkah"
      className="rounded-[26px] bg-gradient-to-br from-[#0F5C4D] to-[#14796A] p-4 text-white shadow-[0_8px_24px_rgba(15,92,77,0.28)]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F3D58A] text-[#0A3A31]" aria-hidden="true">
          <HeartHandshake className="h-6 w-6" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#F3D58A]">Jumat Berkah</p>
          <p className="text-[11.5px] leading-tight text-emerald-50/90">{closed ? "Pesanan Jumat ini ditutup" : formatCountdown(campaign.closesAt, now)} · {campaign.paidPortions}/{campaign.targetPortions} porsi</p>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Porsi terkumpul">
        <div className="h-full rounded-full bg-[#F3D58A] transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>

      <button type="button" onClick={onOpen} className="mt-3 grid w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3D58A]/70 rounded-xl" aria-label="Buka halaman Jumat Berkah">
        {prayers.map((prayer, position) => (
          <span
            key={prayer.prayerId}
            aria-hidden={position === index ? undefined : true}
            className={cn("col-start-1 row-start-1 block transition-opacity duration-500 motion-reduce:transition-none", position === index ? "opacity-100" : "pointer-events-none opacity-0")}
          >
            <span className="block break-words text-[15px] font-bold leading-snug">“{prayer.body}”</span>
            <span className="mt-1 block text-[11.5px] text-emerald-50/80">{prayerMeta(prayer)}</span>
          </span>
        ))}
      </button>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5" role="group" aria-label="Pilih doa">
          <button type="button" onClick={() => setIndex((v) => stepIndex(v, prayers.length, -1))} disabled={prayers.length < 2} aria-label="Doa sebelumnya" className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3D58A]/70">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center" aria-hidden="true">
            {prayers.slice(0, 8).map((prayer, position) => (
              <span key={prayer.prayerId} className={cn("mx-[3px] h-1.5 rounded-full transition-all", position === index % 8 ? "w-4 bg-[#F3D58A]" : "w-1.5 bg-white/35")} />
            ))}
          </div>
          <button type="button" onClick={() => setIndex((v) => stepIndex(v, prayers.length, 1))} disabled={prayers.length < 2} aria-label="Doa berikutnya" className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3D58A]/70">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={onDonate} disabled={closed} className="min-h-11 rounded-full bg-white px-5 text-[13px] font-extrabold text-[#0F5C4D] shadow-sm transition active:scale-95 disabled:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3D58A]/70">
          {closed ? "Ditutup" : "Sedekah"}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{reduced || paused ? "" : `Doa ${index + 1} dari ${prayers.length}`}</span>
    </section>
  );
}

/** Galeri foto pembagian. Dipakai di halaman Jumat Berkah dan di tab Komunitas. */
export function JumatBerkahGallery({ photos, title = "Galeri Jumat Berkah", limit = 12, className }: { photos: JumatBerkahPhoto[]; title?: string; limit?: number; className?: string }) {
  const [open, setOpen] = useState<JumatBerkahPhoto | null>(null);
  const shown = photos.slice(0, limit);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (shown.length === 0) return null;
  return (
    <section className={className} aria-label={title}>
      <h2 className="px-1 font-display text-[19px] font-black leading-tight tracking-tight text-foreground">{title}</h2>
      <div className="no-scrollbar -mx-3 mt-3 flex snap-x gap-2.5 overflow-x-auto overscroll-x-contain px-3 pb-1">
        {shown.map((photo) => (
          <button key={photo.photoId} type="button" onClick={() => setOpen(photo)} className="group relative h-40 w-32 shrink-0 snap-start overflow-hidden rounded-2xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label={photo.caption ? `Buka foto: ${photo.caption}` : "Buka foto"}>
            <img src={photo.imageUrl} alt={photo.caption ?? "Pembagian Jumat Berkah"} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-active:scale-105" />
          </button>
        ))}
      </div>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Foto Jumat Berkah" className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
          <button type="button" aria-label="Tutup foto" onClick={() => setOpen(null)} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"><X className="h-5 w-5" /></button>
          <img src={open.imageUrl} alt={open.caption ?? "Pembagian Jumat Berkah"} className="max-h-[78vh] max-w-full rounded-2xl object-contain" onClick={(event) => event.stopPropagation()} />
          {open.caption ? <p className="mt-3 max-w-sm text-center text-sm text-white/90">{open.caption}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/** Strip galeri untuk tab Komunitas: memuat sendiri dan tersembunyi bila belum ada foto. */
export function JumatBerkahCommunityStrip({ onOpen }: { onOpen: () => void }) {
  const { overview } = useJumatBerkah();
  if (!overview || !overview.enabled || overview.gallery.length === 0) return null;
  return (
    <div className="mb-4">
      <JumatBerkahGallery photos={overview.gallery} title="Galeri Jumat Berkah" limit={8} />
      <button type="button" onClick={onOpen} className="mt-1 min-h-11 px-1 text-xs font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">Lihat program Jumat Berkah</button>
    </div>
  );
}
