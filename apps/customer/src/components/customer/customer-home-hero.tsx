import type { DayPeriod } from "@/lib/day-period";

/** Ilustrasi kafe Djiwa Tentram per waktu hari (public/home-hero, 1080×810 webp). */
export const HERO_IMAGES: Record<DayPeriod, string> = {
  pagi: "/home-hero/hero-pagi.webp",
  siang: "/home-hero/hero-siang.webp",
  sore: "/home-hero/hero-sore.webp",
  malam: "/home-hero/hero-malam.webp",
};

/** Warna rata-rata gambar: tampil seketika selagi gambar dimuat. */
const HERO_PLACEHOLDER: Record<DayPeriod, string> = {
  pagi: "#b9b48f",
  siang: "#cdd9b8",
  sore: "#c98f52",
  malam: "#2a2f45",
};

const CANVAS = "var(--app-canvas, #f2f2f7)";

/**
 * Latar ilustrasi beranda: mengalir ke tepi atas layar lalu larut ke warna kanvas halaman
 * (tanpa garis potong). Letakkan di dalam wadah `relative isolate`; teks beranda tampil di atasnya.
 */
export function CustomerHeroBackdrop({ period }: { period: DayPeriod }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[340px] overflow-hidden"
      style={{ backgroundColor: HERO_PLACEHOLDER[period] }}
    >
      <img
        key={period}
        src={HERO_IMAGES[period]}
        alt=""
        width={1080}
        height={810}
        decoding="async"
        fetchPriority="high"
        draggable={false}
        className="h-full w-full object-cover object-[50%_45%] animate-in fade-in duration-700 motion-reduce:animate-none"
      />
      {/* Scrim atas: menjaga teks putih terbaca di atas dedaunan dan atap yang terang. */}
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/55 via-black/20 to-transparent" />
      {/* Fade bawah: larut ke kanvas halaman. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, transparent 0%, transparent 46%, color-mix(in srgb, ${CANVAS} 72%, transparent) 76%, ${CANVAS} 100%)`,
        }}
      />
    </div>
  );
}
