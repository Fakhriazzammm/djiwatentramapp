// Logika murni Jumat Berkah (tanpa jaringan) supaya mudah diuji.

export type JumatBerkahPrayer = {
  prayerId: string;
  displayName: string;
  body: string;
  portions: number | null;
  aminCount: number;
  aminByMe: boolean;
  isPinned: boolean;
  createdAt: string;
};

export type JumatBerkahPhoto = { photoId: string; imageUrl: string; caption: string | null; createdAt: string };

export type JumatBerkahCampaign = {
  campaignId: string;
  distributionDate: string;
  closesAt: string;
  pricePerPortion: number;
  targetPortions: number;
  paidPortions: number;
  remainingPortions: number;
  donors: number;
  status: string;
};

export type JumatBerkahOverview =
  | { enabled: false }
  | {
      enabled: true;
      campaign: JumatBerkahCampaign;
      maxPortionsPerDonation: number;
      totalPortionsAllTime: number;
      prayers: JumatBerkahPrayer[];
      gallery: JumatBerkahPhoto[];
      lastReport: { distributionDate: string; portionsGiven: number; location: string | null; notes: string | null } | null;
      mine: Array<{ donationId: string; portions: number; amount: number; status: string; createdAt: string; distributionDate: string }>;
    };

export const PRAYER_MAX_LENGTH = 140;
export const PORTION_PRESETS = [1, 5, 10, 20] as const;
export const PRAYER_SUGGESTIONS = [
  "Semoga berkah untuk semua",
  "Untuk almarhum orang tua saya",
  "Semoga dimudahkan rezekinya",
  "Semoga yang makan diberi kekuatan",
];
/** Dipakai saat server belum punya doa sama sekali. */
export const FALLBACK_PRAYER: JumatBerkahPrayer = {
  prayerId: "fallback",
  displayName: "Hamba Allah",
  body: "Semoga setiap suapnya jadi penguat langkah bapak-bapak yang bekerja hari ini.",
  portions: null,
  aminCount: 0,
  aminByMe: false,
  isPinned: false,
  createdAt: "",
};

export function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export function donationAmount(portions: number, pricePerPortion: number): number {
  return Math.max(0, Math.round(portions)) * Math.max(0, Math.round(pricePerPortion));
}

export function progressPercent(paid: number, target: number): number {
  if (!Number.isFinite(paid) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((paid / target) * 100)));
}

/** Indeks berikutnya dalam daftar melingkar. `direction` 1 = maju, -1 = mundur. */
export function stepIndex(current: number, length: number, direction: 1 | -1 = 1): number {
  if (length <= 0) return 0;
  return (((current + direction) % length) + length) % length;
}

/** "Tutup dalam 2 hari 3 jam", "Tutup dalam 5 jam 20 menit", "Tutup dalam 12 menit", atau "Pesanan ditutup". */
export function formatCountdown(closesAt: string, now: number = Date.now()): string {
  const diff = Date.parse(closesAt) - now;
  if (!Number.isFinite(diff) || diff <= 0) return "Pesanan ditutup";
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `Tutup dalam ${days} hari${hours > 0 ? ` ${hours} jam` : ""}`;
  if (hours > 0) return `Tutup dalam ${hours} jam${mins > 0 ? ` ${mins} menit` : ""}`;
  return `Tutup dalam ${Math.max(1, mins)} menit`;
}

/** "Jumat, 6 November 2026" dari tanggal "2026-11-06". */
export function formatDistributionDate(value: string): string {
  const raw = (value || "").slice(0, 10);
  const date = new Date(`${raw}T00:00:00+07:00`);
  if (!raw || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
}

export function validatePrayer(value: string): { ok: boolean; message?: string; text: string } {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length > PRAYER_MAX_LENGTH) return { ok: false, text, message: `Doa maksimal ${PRAYER_MAX_LENGTH} karakter.` };
  return { ok: true, text };
}

export function validatePortions(value: number, max: number, remaining: number): { ok: boolean; message?: string } {
  if (!Number.isInteger(value) || value < 1) return { ok: false, message: "Pilih minimal 1 porsi." };
  if (value > max) return { ok: false, message: `Maksimal ${max} porsi sekali sedekah.` };
  if (value > remaining) return { ok: false, message: remaining > 0 ? `Kuota Jumat ini tersisa ${remaining} porsi.` : "Kuota Jumat ini sudah penuh." };
  return { ok: true };
}

export function displayDonorName(showName: boolean, fullName: string | null | undefined): string {
  if (!showName) return "Hamba Allah";
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || "Sahabat Djiwa";
}

/** Urutan doa untuk banner: yang disematkan dulu, sisanya diacak secara deterministik (seed) agar tidak melompat tiap render. */
export function orderPrayersForBanner(prayers: readonly JumatBerkahPrayer[], seed: number = 0): JumatBerkahPrayer[] {
  const pinned = prayers.filter((p) => p.isPinned);
  const rest = prayers.filter((p) => !p.isPinned);
  let state = (seed >>> 0) || 1;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...pinned, ...rest];
}

/** Path objek storage → URL publik. URL penuh dibiarkan. */
export function resolvePhotoUrl(path: string, publicBase: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${publicBase.replace(/\/$/, "")}/storage/v1/object/public/jumat-berkah/${path.replace(/^\//, "")}`;
}
