import type { Account, Category } from "./types";

export const PAY_ACCOUNT_ID = "pay";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "makan", name: "Makan & minum", icon: "cup", tone: "orange", income: false },
  { id: "transport", name: "Transportasi", icon: "car", tone: "blue", income: false },
  { id: "belanja", name: "Belanja", icon: "bag", tone: "violet", income: false },
  { id: "tagihan", name: "Tagihan & utilitas", icon: "receipt", tone: "amber", income: false },
  { id: "hiburan", name: "Hiburan", icon: "game", tone: "rose", income: false },
  { id: "kesehatan", name: "Kesehatan", icon: "heart", tone: "rose", income: false },
  { id: "pendidikan", name: "Pendidikan", icon: "book", tone: "indigo", income: false },
  { id: "rumah", name: "Rumah", icon: "home", tone: "cyan", income: false },
  { id: "transfer", name: "Transfer", icon: "send", tone: "slate", income: false },
  { id: "lainnya", name: "Lainnya", icon: "tag", tone: "slate", income: false },
  { id: "gaji", name: "Gaji", icon: "down", tone: "emerald", income: true },
  { id: "bonus", name: "Bonus & lainnya", icon: "gift", tone: "emerald", income: true },
];

export const DEFAULT_ACCOUNTS: Account[] = [{ id: "tunai", name: "Tunai", type: "cash", opening: 0 }];

/** Words that point to a category. First match wins; order matters (specific before generic). */
export const KEYWORDS: [string, string[]][] = [
  ["gaji", ["gaji", "salary", "payroll"]],
  ["bonus", ["bonus", "thr", "komisi", "cashback", "hadiah", "untung", "jual"]],
  ["transport", ["parkir", "bensin", "pertalite", "pertamax", "ojek", "gojek", "grab", "tol", "bus", "krl", "kereta", "taksi", "taxi", "angkot", "transjakarta", "mrt", "lrt", "servis motor", "tambal"]],
  ["tagihan", ["listrik", "pln", "token", "pulsa", "paket data", "kuota", "internet", "wifi", "indihome", "air", "pdam", "bpjs", "cicilan", "tagihan"]],
  ["kesehatan", ["obat", "dokter", "apotek", "klinik", "rumah sakit", "vitamin", "dentist", "gigi"]],
  ["hiburan", ["nonton", "bioskop", "netflix", "spotify", "youtube", "game", "konser", "karaoke", "liburan", "wisata"]],
  ["pendidikan", ["buku", "kursus", "spp", "kuliah", "sekolah", "les", "seminar"]],
  ["rumah", ["sewa", "kos", "kontrakan", "perabot", "galon", "gas", "renovasi", "kebersihan"]],
  ["belanja", ["belanja", "indomaret", "alfamart", "supermarket", "baju", "sepatu", "shopee", "tokopedia", "lazada", "tas", "kosmetik", "skincare"]],
  ["makan", ["kopi", "makan", "minum", "bakso", "nasi", "ayam", "sarapan", "lunch", "dinner", "snack", "jajan", "warung", "resto", "gofood", "grabfood", "roti", "teh", "boba", "mie", "soto", "sate", "es"]],
];
export const INCOME_HINTS = ["gaji", "bonus", "thr", "terima", "dapat", "masuk", "jual", "untung", "cashback", "komisi", "hadiah", "bayaran", "dibayar"];

export const TONES = ["orange", "blue", "violet", "amber", "rose", "indigo", "cyan", "emerald", "slate"] as const;
export const CATEGORY_ICONS = ["cup", "car", "bag", "receipt", "game", "heart", "book", "home", "send", "tag", "gift", "phone", "flash", "tv"] as const;

export function guessCategory(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  for (const [id, words] of KEYWORDS) if (words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(t))) return id;
  return null;
}
